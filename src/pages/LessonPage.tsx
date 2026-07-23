import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, CheckCircle2, Clock, Lock, Presentation, Video, Lightbulb,
  AlertTriangle, MessageCircleQuestion, ExternalLink as LinkIcon, Monitor, Smartphone,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAsyncData } from '../lib/useAsyncData'
import { useAccessContext } from '../lib/useAccessContext'
import { evaluateCourseAccess, evaluateLessonAccess, isStaff } from '../lib/access'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  Badge, Breadcrumbs, Button, Card, ErrorState, ExternalLink, SectionHeading, Spinner,
} from '../components/ui'
import { formatDate, formatDuration, LESSON_TYPE_LABEL, readableError } from '../lib/utils'
import { blockIcons, buildTeachingBlocks, detectTopic } from '../lib/lessonExperience'
import TopicVisual from '../components/TopicVisual'
import type {
  Course, Lesson, LessonProgress, LessonScreenshot, LessonSection, ResourceItem, Tool,
} from '../lib/types'

interface LessonBundle {
  lesson: Lesson
  course: Course
  sections: LessonSection[]
  screenshots: LessonScreenshot[]
  tools: Tool[]
  resources: ResourceItem[]
  siblings: Lesson[]
  progress: LessonProgress | null
}

export default function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const { profile, role } = useAuth()
  const { notify } = useToast()
  const navigate = useNavigate()
  const staff = isStaff(role)
  const accessState = useAccessContext()
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)

  const state = useAsyncData<LessonBundle>(async () => {
    const { data: lesson, error } = await supabase
      .from('lessons').select('*').eq('id', lessonId).maybeSingle()
    if (error) throw error
    if (!lesson) throw new Error('This lesson is not available to your account.')

    const [course, sections, screenshots, lessonTools, resources, siblings, progress] = await Promise.all([
      supabase.from('courses').select('*').eq('id', lesson.course_id).maybeSingle(),
      supabase.from('lesson_sections').select('*').eq('lesson_id', lesson.id).order('sort_order'),
      supabase.from('lesson_screenshots').select('*').eq('lesson_id', lesson.id)
        .eq('is_archived', false).order('sort_order'),
      supabase.from('lesson_tools').select('tools(*)').eq('lesson_id', lesson.id),
      supabase.from('resources').select('*, resource_types(id, name, slug, icon)')
        .eq('lesson_id', lesson.id).eq('is_archived', false),
      supabase.from('lessons').select('*').eq('course_id', lesson.course_id).order('sort_order'),
      profile
        ? supabase.from('lesson_progress').select('*')
            .eq('lesson_id', lesson.id).eq('student_id', profile.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    return {
      lesson: lesson as Lesson,
      course: course.data as Course,
      sections: (sections.data ?? []) as LessonSection[],
      screenshots: (screenshots.data ?? []) as LessonScreenshot[],
      tools: ((lessonTools.data ?? []) as unknown as Array<{ tools: Tool | null }>)
        .map((r) => r.tools).filter(Boolean) as Tool[],
      resources: (resources.data ?? []) as ResourceItem[],
      siblings: (siblings.data ?? []) as Lesson[],
      progress: (progress.data as LessonProgress) ?? null,
    }
  }, [lessonId, profile?.id])

  // Record that the student opened this lesson.
  useEffect(() => {
    const data = state.data
    if (!data || !profile || role !== 'student') return
    setCompleted(!!data.progress?.is_completed)
    if (data.progress) return
    supabase.from('lesson_progress').insert({
      lesson_id: data.lesson.id,
      course_id: data.lesson.course_id,
      student_id: profile.id,
    }).then(() => undefined)
  }, [state.data, profile, role])

  if (state.loading || accessState.loading) return <Spinner label="Loading lesson" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  const { lesson, course, sections, screenshots, tools, resources, siblings } = state.data!
  const ctx = accessState.data!
  const courseAccess = evaluateCourseAccess(course, ctx)
  const access = evaluateLessonAccess(lesson, courseAccess, ctx)

  if (!access.allowed) {
    return (
      <>
        <Breadcrumbs items={[
          { label: 'My courses', to: '/courses' },
          { label: course?.title ?? 'Course', to: `/courses/${course?.slug}` },
          { label: lesson.title },
        ]} />
        <div className="card border-amber-200 bg-amber-50 p-6">
          <div className="flex gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <div>
              <h1 className="text-lg font-bold text-amber-900">{lesson.title} is locked</h1>
              <p className="mt-1 text-sm text-amber-900">{access.reason}</p>
              <p className="mt-1 text-sm text-amber-800">{access.action}</p>
              <div className="mt-4 flex gap-2">
                <Link to={`/courses/${course?.slug}`}><Button variant="outline" size="sm">Back to course</Button></Link>
                <Link to="/questions"><Button size="sm">Ask about access</Button></Link>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  const index = siblings.findIndex((l) => l.id === lesson.id)
  const previous = index > 0 ? siblings[index - 1] : null
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null
  const studentSections = sections.filter((s) => !s.coach_only)
  const teachingBlocks = buildTeachingBlocks(lesson.student_content, 'Core lesson')
  const topic = detectTopic(course.title, lesson.title, lesson.description, lesson.objective)
  const coursePercent = siblings.length ? Math.round(((index + (completed ? 1 : 0)) / siblings.length) * 100) : 0
  const coachSections = sections.filter((s) => s.coach_only)

  const markComplete = async () => {
    if (!profile) return
    setSaving(true)
    try {
      const { error } = await supabase.from('lesson_progress').upsert({
        lesson_id: lesson.id,
        course_id: lesson.course_id,
        student_id: profile.id,
        is_completed: true,
        completed_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      }, { onConflict: 'lesson_id,student_id' })
      if (error) throw error
      setCompleted(true)
      notify('Lesson marked complete.')
      if (next) navigate(`/lessons/${next.id}`)
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Breadcrumbs items={[
        { label: staff ? 'Courses' : 'My courses', to: '/courses' },
        { label: course?.title ?? 'Course', to: `/courses/${course?.slug}` },
        { label: lesson.title },
      ]} />

      <section className="lesson-premium-hero">
        <div className="lesson-premium-copy">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{topic.label}</Badge>
            <Badge tone="neutral">{LESSON_TYPE_LABEL[lesson.type]}</Badge>
          </div>
          <h1>{lesson.title}</h1>
          <p>{lesson.objective || lesson.description}</p>
          <div className="lesson-hero-meta">
            <span><Clock className="h-4 w-4" aria-hidden />{formatDuration(lesson.estimated_minutes)}</span>
            <span>Lesson {index + 1} of {siblings.length}</span>
            <span>{coursePercent}% course position</span>
          </div>
          {staff && <div className="mt-5 flex flex-wrap gap-2">
            <Link to={`/builder/lessons/${lesson.id}`}><Button variant="outline">Edit lesson</Button></Link>
            <Link to={`/present/${lesson.id}`}><Button><Presentation className="h-4 w-4" aria-hidden />Present lesson</Button></Link>
            <Link to={`/present/course/${course.id}`}><Button variant="secondary">Present full course</Button></Link>
          </div>}
        </div>
        <TopicVisual topic={topic} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral"><Clock className="h-3 w-3" aria-hidden />{formatDuration(lesson.estimated_minutes)}</Badge>
            {lesson.is_required ? <Badge tone="brand">Required</Badge> : <Badge tone="neutral">Optional</Badge>}
            {completed && <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden />Completed</Badge>}
          </div>

          {teachingBlocks.length > 0 && (
            <div className="lesson-block-stack">
              {teachingBlocks.map((block, blockIndex) => {
                const BlockIcon = blockIcons[block.kind]
                return (
                  <Card key={`${block.title}-${blockIndex}`} className={`teaching-block teaching-block-${block.kind}`}>
                    <div className="teaching-block-head">
                      <span><BlockIcon aria-hidden /></span>
                      <div><p>{block.kind.replace('_', ' ')}</p><h2>{block.title}</h2></div>
                    </div>
                    {['steps', 'checklist', 'summary'].includes(block.kind) && block.points.length > 1 ? (
                      <ol className="teaching-points">
                        {block.points.map((point, pointIndex) => <li key={point}><span>{pointIndex + 1}</span><p>{point}</p></li>)}
                      </ol>
                    ) : <p className="prose-lesson mt-4">{block.body}</p>}
                  </Card>
                )
              })}
            </div>
          )}

          {!lesson.student_content && studentSections.length === 0 && screenshots.length === 0 && (
            <Card>
              <p className="prose-lesson">
                {lesson.description || 'Your coach will walk through this lesson in the live session. ' +
                  'Written notes will appear here once they are published.'}
              </p>
            </Card>
          )}

          {studentSections.map((section) => (
            <Card key={section.id}>
              <h2 className="text-base font-semibold text-ink">{section.title}</h2>
              {section.section_type === 'example' && <Badge tone="info" className="mt-2">Example</Badge>}
              {section.section_type === 'activity' && <Badge tone="brand" className="mt-2">Activity</Badge>}
              <p className="prose-lesson mt-2">{section.body}</p>
            </Card>
          ))}

          {lesson.examples && (
            <Card className="border-sky-200 bg-sky-50/50">
              <h2 className="text-base font-semibold text-sky-900">Worked example</h2>
              <p className="prose-lesson mt-2 text-sky-900/80">{lesson.examples}</p>
            </Card>
          )}

          {lesson.live_activity && (
            <Card className="border-brand-200 bg-brand-50/60">
              <h2 className="text-base font-semibold text-brand-900">Practice activity</h2>
              <p className="prose-lesson mt-2 text-brand-900/80">{lesson.live_activity}</p>
            </Card>
          )}

          {screenshots.length > 0 && (
            <div>
              <SectionHeading title="Step-by-step walkthrough"
                description={`${screenshots.length} steps. Follow them in order.`} />
              <div className="space-y-4">
                {screenshots.map((shot) => (
                  <Card key={shot.id}>
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                        {shot.step_number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-ink">{shot.title}</h3>
                        <p className="mt-1 text-sm text-ink-muted">{shot.instruction}</p>

                        {shot.image_url ? (
                          <img src={shot.image_url} alt={`Step ${shot.step_number}: ${shot.title}`}
                            loading="lazy"
                            className="mt-3 w-full rounded-xl border border-canvas-line" />
                        ) : (
                          <div className="mt-3 flex items-center justify-center rounded-xl border border-dashed border-canvas-line bg-canvas px-4 py-8 text-xs text-ink-soft">
                            Screenshot not uploaded yet
                          </div>
                        )}

                        {shot.highlight_description && (
                          <p className="mt-2 text-xs text-ink-soft">Look for: {shot.highlight_description}</p>
                        )}
                        {shot.tip && (
                          <p className="mt-2 flex gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                            <Lightbulb className="h-3.5 w-3.5 shrink-0" aria-hidden />{shot.tip}
                          </p>
                        )}
                        {shot.warning && (
                          <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />{shot.warning}
                          </p>
                        )}
                        <p className="mt-2 flex items-center gap-2 text-[11px] text-ink-soft">
                          {shot.device_type === 'mobile'
                            ? <Smartphone className="h-3 w-3" aria-hidden />
                            : <Monitor className="h-3 w-3" aria-hidden />}
                          {shot.tool_version} · captured {formatDate(shot.captured_on)}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {staff && (lesson.coach_notes || coachSections.length > 0) && (
            <Card className="border-brand-300 bg-brand-50/70">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-brand-900">Coach notes</h2>
                <Badge tone="brand">Not visible to students</Badge>
              </div>
              {lesson.coach_notes && <p className="prose-lesson mt-2 text-brand-900/80">{lesson.coach_notes}</p>}
              {coachSections.map((section) => (
                <div key={section.id} className="mt-4">
                  <h3 className="text-sm font-semibold text-brand-900">{section.title}</h3>
                  <p className="prose-lesson mt-1 text-brand-900/80">{section.body}</p>
                </div>
              ))}
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-canvas-line pt-5">
            <div className="flex gap-2">
              {previous && (
                <Link to={`/lessons/${previous.id}`}>
                  <Button variant="outline"><ArrowLeft className="h-4 w-4" aria-hidden />Previous</Button>
                </Link>
              )}
              {next && (
                <Link to={`/lessons/${next.id}`}>
                  <Button variant="outline">Next<ArrowRight className="h-4 w-4" aria-hidden /></Button>
                </Link>
              )}
            </div>
            {role === 'student' && (
              completed && next ? (
                <Button onClick={() => navigate(`/lessons/${next.id}`)}>
                  Complete & Continue<ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              ) : completed ? (
                <Link to={`/courses/${course.slug}`}><Button><CheckCircle2 className="h-4 w-4" aria-hidden />Course lesson complete</Button></Link>
              ) : (
                <Button onClick={markComplete} loading={saving}>
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  {next ? 'Complete & Continue' : 'Complete lesson'}
                </Button>
              )
            )}
          </div>
        </div>

        <aside className="space-y-6">
          {lesson.recording_url && (
            <Card>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Video className="h-4 w-4 text-brand-600" aria-hidden />Session recording
              </h2>
              <ExternalLink href={lesson.recording_url} className="mt-3 block">
                <Button variant="secondary" className="w-full">Watch the recording</Button>
              </ExternalLink>
            </Card>
          )}

          {tools.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-ink">Tools for this lesson</h2>
              <ul className="mt-3 space-y-2">
                {tools.map((tool) => (
                  <li key={tool.id} className="text-sm">
                    <p className="font-medium text-ink">{tool.name}</p>
                    {tool.website_url && (
                      <ExternalLink href={tool.website_url}
                        className="text-xs text-brand-700 hover:underline">Open website</ExternalLink>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {resources.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-ink">Lesson resources</h2>
              <ul className="mt-3 space-y-2">
                {resources.map((resource) => (
                  <li key={resource.id}>
                    {resource.url ? (
                      <ExternalLink href={resource.url}
                        className="flex items-start gap-2 text-sm text-brand-700 hover:underline">
                        <LinkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{resource.title}
                      </ExternalLink>
                    ) : <span className="text-sm text-ink-muted">{resource.title}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h2 className="text-sm font-semibold text-ink">Stuck on this lesson?</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Send your coach a question. Include what you already tried.
            </p>
            <Link to={`/questions?course=${lesson.course_id}&lesson=${lesson.id}`} className="mt-3 block">
              <Button variant="outline" className="w-full">
                <MessageCircleQuestion className="h-4 w-4" aria-hidden />Ask a question
              </Button>
            </Link>
          </Card>
        </aside>
      </div>
    </>
  )
}
