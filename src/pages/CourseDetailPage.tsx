import { Link, useParams } from 'react-router-dom'
import {
  BookOpen, CheckCircle2, Clock, Lock, Presentation, Wrench, FolderOpen, ExternalLink as LinkIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAsyncData } from '../lib/useAsyncData'
import { useAccessContext } from '../lib/useAccessContext'
import { evaluateCourseAccess, evaluateLessonAccess, isStaff } from '../lib/access'
import { useAuth } from '../context/AuthContext'
import {
  Badge, Breadcrumbs, Button, Card, EmptyState, ErrorState, ExternalLink, PageHeader,
  ProgressBar, SectionHeading, Spinner,
} from '../components/ui'
import { formatDuration, LESSON_TYPE_LABEL, LEVEL_LABEL, LEVEL_SHORT } from '../lib/utils'
import type { Course, Lesson, LessonProgress, Module, ResourceItem, Tool } from '../lib/types'

interface CourseBundle {
  course: Course
  modules: Module[]
  lessons: Lesson[]
  progress: LessonProgress[]
  tools: Tool[]
  resources: ResourceItem[]
  prerequisiteCourses: Course[]
}

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const { role, profile } = useAuth()
  const staff = isStaff(role)
  const accessState = useAccessContext()

  const state = useAsyncData<CourseBundle>(async () => {
    const { data: course, error } = await supabase
      .from('courses').select('*, specializations(id, name, slug)').eq('slug', slug).maybeSingle()
    if (error) throw error
    if (!course) throw new Error('That course does not exist or is not available to your account.')

    const [modules, lessons, progress, courseTools, resources, prereqs] = await Promise.all([
      supabase.from('modules').select('*').eq('course_id', course.id).order('sort_order'),
      supabase.from('lessons').select('*').eq('course_id', course.id).order('sort_order'),
      profile
        ? supabase.from('lesson_progress').select('*').eq('course_id', course.id).eq('student_id', profile.id)
        : Promise.resolve({ data: [] }),
      supabase.from('course_tools').select('tools(*)').eq('course_id', course.id),
      supabase.from('resources').select('*, resource_types(id, name, slug, icon)')
        .eq('course_id', course.id).eq('is_archived', false).order('sort_order'),
      supabase.from('course_prerequisites').select('prerequisite_id').eq('course_id', course.id),
    ])

    const prereqIds = (prereqs.data ?? []).map((p: { prerequisite_id: string }) => p.prerequisite_id)
    const prerequisiteCourses = prereqIds.length
      ? ((await supabase.from('courses').select('*').in('id', prereqIds)).data ?? [])
      : []

    return {
      course: course as Course,
      modules: (modules.data ?? []) as Module[],
      lessons: (lessons.data ?? []) as Lesson[],
      progress: (progress.data ?? []) as LessonProgress[],
      tools: ((courseTools.data ?? []) as unknown as Array<{ tools: Tool | null }>)
        .map((row) => row.tools).filter(Boolean) as Tool[],
      resources: (resources.data ?? []) as ResourceItem[],
      prerequisiteCourses: prerequisiteCourses as Course[],
    }
  }, [slug, profile?.id])

  if (state.loading || accessState.loading) return <Spinner label="Loading course" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  const { course, modules, lessons, progress, tools, resources, prerequisiteCourses } = state.data!
  const ctx = accessState.data!
  const access = evaluateCourseAccess(course, ctx)
  const enrollment = ctx.enrollments.find((e) => e.course_id === course.id)
  const completedIds = new Set(progress.filter((p) => p.is_completed).map((p) => p.lesson_id))
  const requiredCount = lessons.filter((l) => l.is_required).length

  return (
    <>
      <Breadcrumbs items={[
        { label: staff ? 'Courses' : 'My courses', to: '/courses' },
        { label: course.title },
      ]} />

      <PageHeader
        eyebrow={LEVEL_SHORT[course.level]}
        title={course.title}
        description={course.description}
        action={
          <>
            {staff && (
              <>
                <Link to="/builder">
                  <Button variant="outline">Edit in builder</Button>
                </Link>
                <Link to={`/present/course/${course.id}`}>
                  <Button variant="secondary"><Presentation className="h-4 w-4" aria-hidden />Present full course</Button>
                </Link>
              </>
            )}
            {access.allowed && lessons.length > 0 && (
              <Link to={`/lessons/${lessons[0].id}`}>
                <Button>{completedIds.size > 0 ? 'Continue course' : 'Start course'}</Button>
              </Link>
            )}
          </>
        }
      />

      {!access.allowed && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <div>
              <h2 className="font-semibold text-amber-900">This course is locked</h2>
              <p className="mt-1 text-sm text-amber-900">{access.reason}</p>
              <p className="mt-1 text-sm text-amber-800">{access.action}</p>
              <Link to="/questions" className="mt-3 inline-block">
                <Button size="sm" variant="outline">Ask about access</Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {enrollment && (
            <Card className="mb-6">
              <ProgressBar value={Number(enrollment.progress)} label="Your progress" />
              <p className="mt-2 text-xs text-ink-soft">
                {completedIds.size} of {requiredCount} required lessons complete
              </p>
            </Card>
          )}

          <SectionHeading title="Course content"
            description={`${modules.length} modules · ${lessons.length} lessons · ${formatDuration(course.estimated_minutes)}`} />

          {modules.length === 0 ? (
            <EmptyState icon={BookOpen} title="No modules yet"
              description="This course has not been built out yet." />
          ) : (
            <div className="space-y-4">
              {modules.map((module, moduleIndex) => {
                const moduleLessons = lessons.filter((l) => l.module_id === module.id)
                return (
                  <Card key={module.id} className="p-0">
                    <div className="border-b border-canvas-line px-5 py-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                        Module {moduleIndex + 1}
                      </p>
                      <h3 className="mt-0.5 font-semibold text-ink">{module.title}</h3>
                      {module.description && (
                        <p className="mt-1 text-sm text-ink-muted">{module.description}</p>
                      )}
                    </div>
                    <ul className="divide-y divide-canvas-line">
                      {moduleLessons.map((lesson) => {
                        const lessonAccess = evaluateLessonAccess(lesson, access, ctx)
                        const done = completedIds.has(lesson.id)
                        const body = (
                          <>
                            <span className="flex min-w-0 items-center gap-3">
                              {done ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                              ) : lessonAccess.allowed ? (
                                <BookOpen className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
                              ) : (
                                <Lock className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
                              )}
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-ink">{lesson.title}</span>
                                <span className="block truncate text-xs text-ink-soft">
                                  {LESSON_TYPE_LABEL[lesson.type]}
                                  {!lesson.is_required && ' · Optional'}
                                  {lesson.preview_available && ' · Free preview'}
                                </span>
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2 text-xs text-ink-soft">
                              <Clock className="h-3.5 w-3.5" aria-hidden />
                              {formatDuration(lesson.estimated_minutes)}
                            </span>
                          </>
                        )
                        return (
                          <li key={lesson.id}>
                            {lessonAccess.allowed ? (
                              <Link to={`/lessons/${lesson.id}`}
                                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-brand-50/40">
                                {body}
                              </Link>
                            ) : (
                              <div className="flex cursor-not-allowed items-center justify-between gap-3 px-5 py-3 opacity-60"
                                title={lessonAccess.reason}>
                                {body}
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <h2 className="text-sm font-semibold text-ink">What you will be able to do</h2>
            <ul className="mt-3 space-y-2">
              {course.learning_outcomes.map((outcome) => (
                <li key={outcome} className="flex gap-2 text-sm text-ink-muted">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden />
                  {outcome}
                </li>
              ))}
            </ul>
            <dl className="mt-5 space-y-2 border-t border-canvas-line pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Level</dt>
                <dd className="text-right font-medium text-ink">{LEVEL_LABEL[course.level]}</dd>
              </div>
              {course.specializations && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-soft">Specialization</dt>
                  <dd className="text-right font-medium text-ink">{course.specializations.name}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Estimated time</dt>
                <dd className="font-medium text-ink">{formatDuration(course.estimated_minutes)}</dd>
              </div>
              {course.upgrade_required && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-soft">Access</dt>
                  <dd><Badge tone="warning">Upgrade required</Badge></dd>
                </div>
              )}
            </dl>
          </Card>

          {prerequisiteCourses.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-ink">Prerequisites</h2>
              <ul className="mt-3 space-y-2">
                {prerequisiteCourses.map((prereq) => (
                  <li key={prereq.id}>
                    <Link to={`/courses/${prereq.slug}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-muted hover:bg-canvas">
                      <span className="truncate">{prereq.title}</span>
                      {ctx.completedCourseIds.includes(prereq.id)
                        ? <Badge tone="success">Done</Badge>
                        : <Badge tone="neutral">Pending</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {course.requirements.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-ink">Before you start</h2>
              <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
                {course.requirements.map((req) => <li key={req}>· {req}</li>)}
              </ul>
            </Card>
          )}

          {access.allowed && tools.length > 0 && (
            <Card>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Wrench className="h-4 w-4 text-brand-600" aria-hidden />Tools used
              </h2>
              <ul className="mt-3 space-y-1.5">
                {tools.map((tool) => (
                  <li key={tool.id}>
                    <Link to="/tools" className="rounded text-sm text-brand-700 hover:underline">{tool.name}</Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {access.allowed && resources.length > 0 && (
            <Card>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <FolderOpen className="h-4 w-4 text-brand-600" aria-hidden />Course resources
              </h2>
              <ul className="mt-3 space-y-2">
                {resources.map((resource) => (
                  <li key={resource.id}>
                    {resource.url ? (
                      <ExternalLink href={resource.url}
                        className="flex items-start gap-2 rounded text-sm text-brand-700 hover:underline">
                        <LinkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span>{resource.title}</span>
                      </ExternalLink>
                    ) : (
                      <span className="text-sm text-ink-muted">{resource.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  )
}
