import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Plus, Presentation } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAsyncData } from '../../lib/useAsyncData'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, SearchInput,
  SectionHeading, Select, Spinner, Textarea,
} from '../../components/ui'
import { formatDuration, LESSON_TYPE_LABEL, LEVEL_SHORT, readableError } from '../../lib/utils'
import type { Course, LearningLevel, Lesson, LessonType, Module, Specialization } from '../../lib/types'

const EMPTY_COURSE = {
  id: '', title: '', slug: '', description: '', level: 'level_1' as LearningLevel,
  specialization_id: '', estimated_minutes: 180, is_published: false, upgrade_required: false,
  learning_outcomes: '',
}
const EMPTY_MODULE = { id: '', title: '', description: '' }
const EMPTY_LESSON = {
  title: '', objective: '', type: 'text' as LessonType, estimated_minutes: 20, is_required: true,
}

export default function BuilderPage() {
  const { profile } = useAuth()
  const { notify } = useToast()
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [courseForm, setCourseForm] = useState<typeof EMPTY_COURSE | null>(null)
  const [moduleForm, setModuleForm] = useState<typeof EMPTY_MODULE | null>(null)
  const [lessonForm, setLessonForm] = useState<(typeof EMPTY_LESSON & { moduleId: string }) | null>(null)
  const [saving, setSaving] = useState(false)

  const state = useAsyncData<{ courses: Course[]; specializations: Specialization[] }>(async () => {
    const [courses, specs] = await Promise.all([
      supabase.from('courses').select('*, specializations(id, name, slug)').order('level').order('sort_order'),
      supabase.from('specializations').select('*').order('sort_order'),
    ])
    if (courses.error) throw courses.error
    return {
      courses: (courses.data ?? []) as Course[],
      specializations: (specs.data ?? []) as Specialization[],
    }
  }, [])

  const structure = useAsyncData<{ modules: Module[]; lessons: Lesson[] }>(async () => {
    if (!selectedCourse) return { modules: [], lessons: [] }
    const [modules, lessons] = await Promise.all([
      supabase.from('modules').select('*').eq('course_id', selectedCourse).order('sort_order'),
      supabase.from('lessons').select('*').eq('course_id', selectedCourse).order('sort_order'),
    ])
    return {
      modules: (modules.data ?? []) as Module[],
      lessons: (lessons.data ?? []) as Lesson[],
    }
  }, [selectedCourse])

  const saveCourse = async () => {
    if (!courseForm) return
    setSaving(true)
    try {
      const payload = {
        title: courseForm.title.trim(),
        slug: courseForm.slug.trim() || courseForm.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: courseForm.description,
        level: courseForm.level,
        specialization_id: courseForm.specialization_id || null,
        estimated_minutes: Number(courseForm.estimated_minutes) || 0,
        is_published: courseForm.is_published,
        upgrade_required: courseForm.upgrade_required,
        learning_outcomes: courseForm.learning_outcomes
          .split('\n').map((s) => s.trim()).filter(Boolean),
        created_by: profile?.id ?? null,
      }
      const { error } = courseForm.id
        ? await supabase.from('courses').update(payload).eq('id', courseForm.id)
        : await supabase.from('courses').insert(payload)
      if (error) throw error
      notify(courseForm.id ? 'Course updated.' : 'Course created.')
      setCourseForm(null)
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveModule = async () => {
    if (!moduleForm || !selectedCourse) return
    setSaving(true)
    try {
      const course = state.data!.courses.find((c) => c.id === selectedCourse)
      const payload = {
        course_id: selectedCourse,
        title: moduleForm.title.trim(),
        description: moduleForm.description,
        level: course?.level ?? 'level_1',
        sort_order: (structure.data?.modules.length ?? 0) + 1,
      }
      const { error } = moduleForm.id
        ? await supabase.from('modules').update({
            title: payload.title, description: payload.description,
          }).eq('id', moduleForm.id)
        : await supabase.from('modules').insert(payload)
      if (error) throw error
      notify(moduleForm.id ? 'Module updated.' : 'Module added.')
      setModuleForm(null)
      structure.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveLesson = async () => {
    if (!lessonForm || !selectedCourse) return
    setSaving(true)
    try {
      const course = state.data!.courses.find((c) => c.id === selectedCourse)
      const siblings = (structure.data?.lessons ?? []).filter((l) => l.module_id === lessonForm.moduleId)
      const { error } = await supabase.from('lessons').insert({
        module_id: lessonForm.moduleId,
        course_id: selectedCourse,
        title: lessonForm.title.trim(),
        objective: lessonForm.objective,
        description: lessonForm.objective,
        type: lessonForm.type,
        estimated_minutes: Number(lessonForm.estimated_minutes) || 15,
        is_required: lessonForm.is_required,
        sort_order: siblings.length + 1,
        level: course?.level ?? 'level_1',
        required_student_level: course?.level ?? 'level_1',
        required_specialization_id: course?.specialization_id ?? null,
      })
      if (error) throw error
      notify('Lesson added. Open it to write the content.')
      setLessonForm(null)
      structure.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const togglePublished = async (course: Course) => {
    try {
      const { error } = await supabase.from('courses')
        .update({ is_published: !course.is_published }).eq('id', course.id)
      if (error) throw error
      notify(course.is_published ? 'Course moved back to draft.' : 'Course published.')
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    }
  }

  if (state.loading) return <Spinner label="Loading the builder" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  const term = search.trim().toLowerCase()
  const courses = state.data!.courses.filter((c) => !term || c.title.toLowerCase().includes(term))
  const active = state.data!.courses.find((c) => c.id === selectedCourse) ?? null

  return (
    <>
      <PageHeader
        title="Course builder"
        description="Create courses, add modules and lessons, then write the lesson content."
        action={<Button onClick={() => setCourseForm({ ...EMPTY_COURSE })}>
          <Plus className="h-4 w-4" aria-hidden />New course
        </Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
        <div>
          <div className="mb-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Search courses" label="Search courses" />
          </div>
          <div className="space-y-2">
            {courses.map((course) => (
              <button
                key={course.id} type="button" onClick={() => setSelectedCourse(course.id)}
                className={`card w-full p-4 text-left transition-colors hover:border-brand-200 ${
                  selectedCourse === course.id ? 'border-brand-300 bg-brand-50/50' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-semibold text-ink">{course.title}</p>
                  {!course.is_published && <Badge tone="warning">Draft</Badge>}
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  {LEVEL_SHORT[course.level]}
                  {course.specializations ? ` · ${course.specializations.name}` : ''}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div>
          {!active ? (
            <EmptyState icon={BookOpen} title="Select a course"
              description="Choose a course on the left to edit its modules and lessons."
              action={<Button onClick={() => setCourseForm({ ...EMPTY_COURSE })}>Create a course</Button>} />
          ) : (
            <>
              <Card className="mb-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-ink">{active.title}</h2>
                    <p className="mt-1 text-sm text-ink-muted">{active.description}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone="info">{LEVEL_SHORT[active.level]}</Badge>
                      <Badge tone="neutral">{formatDuration(active.estimated_minutes)}</Badge>
                      {active.upgrade_required && <Badge tone="warning">Upgrade required</Badge>}
                      <Badge tone={active.is_published ? 'success' : 'warning'}>
                        {active.is_published ? 'Published' : 'Draft'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCourseForm({
                      id: active.id, title: active.title, slug: active.slug, description: active.description,
                      level: active.level, specialization_id: active.specialization_id ?? '',
                      estimated_minutes: active.estimated_minutes, is_published: active.is_published,
                      upgrade_required: active.upgrade_required,
                      learning_outcomes: active.learning_outcomes.join('\n'),
                    })}>Edit course</Button>
                    <Button size="sm" variant={active.is_published ? 'ghost' : 'primary'}
                      onClick={() => togglePublished(active)}>
                      {active.is_published ? 'Move to draft' : 'Publish'}
                    </Button>
                  </div>
                </div>
              </Card>

              <SectionHeading title="Modules and lessons"
                action={<Button size="sm" variant="secondary" onClick={() => setModuleForm({ ...EMPTY_MODULE })}>
                  <Plus className="h-4 w-4" aria-hidden />Add module
                </Button>} />

              {structure.loading ? <Spinner label="Loading structure" /> : (
                (structure.data?.modules.length ?? 0) === 0 ? (
                  <EmptyState icon={BookOpen} title="No modules yet"
                    description="Modules group lessons into a teachable sequence."
                    action={<Button onClick={() => setModuleForm({ ...EMPTY_MODULE })}>Add the first module</Button>} />
                ) : (
                  <div className="space-y-4">
                    {structure.data!.modules.map((module, index) => (
                      <Card key={module.id} className="p-0">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-canvas-line px-5 py-4">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                              Module {index + 1}
                            </p>
                            <h3 className="mt-0.5 font-semibold text-ink">{module.title}</h3>
                            {module.description && (
                              <p className="mt-1 text-sm text-ink-muted">{module.description}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setModuleForm({
                              id: module.id, title: module.title, description: module.description,
                            })}>Edit</Button>
                            <Button size="sm" variant="outline"
                              onClick={() => setLessonForm({ ...EMPTY_LESSON, moduleId: module.id })}>
                              <Plus className="h-4 w-4" aria-hidden />Lesson
                            </Button>
                          </div>
                        </div>
                        <ul className="divide-y divide-canvas-line">
                          {structure.data!.lessons.filter((l) => l.module_id === module.id).map((lesson) => (
                            <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink">{lesson.title}</p>
                                <p className="text-xs text-ink-soft">
                                  {LESSON_TYPE_LABEL[lesson.type]} · {formatDuration(lesson.estimated_minutes)}
                                  {!lesson.is_required && ' · Optional'}
                                </p>
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <Link to={`/builder/lessons/${lesson.id}`}>
                                  <Button size="sm" variant="ghost">Edit content</Button>
                                </Link>
                                <Link to={`/present/${lesson.id}`}>
                                  <Button size="sm" variant="outline">
                                    <Presentation className="h-4 w-4" aria-hidden />Present
                                  </Button>
                                </Link>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    ))}
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>

      {/* Course modal */}
      <Modal
        open={!!courseForm} onClose={() => setCourseForm(null)} wide
        title={courseForm?.id ? 'Edit course' : 'Create a course'}
        footer={
          <>
            <Button variant="outline" onClick={() => setCourseForm(null)}>Cancel</Button>
            <Button onClick={saveCourse} loading={saving} disabled={!courseForm?.title.trim()}>Save course</Button>
          </>
        }
      >
        {courseForm && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label="Course title" required value={courseForm.title}
                onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Textarea label="Description" value={courseForm.description}
                onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })} />
            </div>
            <Select label="Learning level" value={courseForm.level}
              onChange={(e) => setCourseForm({ ...courseForm, level: e.target.value as LearningLevel })}>
              <option value="level_1">Level 1</option>
              <option value="level_2">Level 2</option>
              <option value="level_3">Level 3</option>
            </Select>
            <Select label="Specialization" value={courseForm.specialization_id}
              onChange={(e) => setCourseForm({ ...courseForm, specialization_id: e.target.value })}>
              <option value="">No specialization</option>
              {state.data!.specializations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Input label="Estimated minutes" type="number" min={0} value={courseForm.estimated_minutes}
              onChange={(e) => setCourseForm({ ...courseForm, estimated_minutes: Number(e.target.value) })} />
            <Input label="Slug" value={courseForm.slug}
              onChange={(e) => setCourseForm({ ...courseForm, slug: e.target.value })}
              hint="Leave empty to generate from the title." />
            <div className="sm:col-span-2">
              <Textarea label="Learning outcomes" value={courseForm.learning_outcomes}
                onChange={(e) => setCourseForm({ ...courseForm, learning_outcomes: e.target.value })}
                hint="One outcome per line." />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={courseForm.is_published}
                onChange={(e) => setCourseForm({ ...courseForm, is_published: e.target.checked })}
                className="h-4 w-4 rounded border-canvas-line text-brand-600" />
              Published
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={courseForm.upgrade_required}
                onChange={(e) => setCourseForm({ ...courseForm, upgrade_required: e.target.checked })}
                className="h-4 w-4 rounded border-canvas-line text-brand-600" />
              Requires an approved upgrade
            </label>
          </div>
        )}
      </Modal>

      {/* Module modal */}
      <Modal
        open={!!moduleForm} onClose={() => setModuleForm(null)}
        title={moduleForm?.id ? 'Edit module' : 'Add a module'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModuleForm(null)}>Cancel</Button>
            <Button onClick={saveModule} loading={saving} disabled={!moduleForm?.title.trim()}>Save module</Button>
          </>
        }
      >
        {moduleForm && (
          <div className="space-y-4">
            <Input label="Module title" required value={moduleForm.title}
              onChange={(e) => setModuleForm({ ...moduleForm, title: e.target.value })} />
            <Textarea label="Description" value={moduleForm.description}
              onChange={(e) => setModuleForm({ ...moduleForm, description: e.target.value })} />
          </div>
        )}
      </Modal>

      {/* Lesson modal */}
      <Modal
        open={!!lessonForm} onClose={() => setLessonForm(null)}
        title="Add a lesson"
        description="You can write the full content after the lesson is created."
        footer={
          <>
            <Button variant="outline" onClick={() => setLessonForm(null)}>Cancel</Button>
            <Button onClick={saveLesson} loading={saving} disabled={!lessonForm?.title.trim()}>Add lesson</Button>
          </>
        }
      >
        {lessonForm && (
          <div className="space-y-4">
            <Input label="Lesson title" required value={lessonForm.title}
              onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} />
            <Textarea label="Objective" value={lessonForm.objective}
              onChange={(e) => setLessonForm({ ...lessonForm, objective: e.target.value })}
              hint="One sentence: what the student will be able to do." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Lesson type" value={lessonForm.type}
                onChange={(e) => setLessonForm({ ...lessonForm, type: e.target.value as LessonType })}>
                {Object.entries(LESSON_TYPE_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </Select>
              <Input label="Estimated minutes" type="number" min={1} value={lessonForm.estimated_minutes}
                onChange={(e) => setLessonForm({ ...lessonForm, estimated_minutes: Number(e.target.value) })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={lessonForm.is_required}
                onChange={(e) => setLessonForm({ ...lessonForm, is_required: e.target.checked })}
                className="h-4 w-4 rounded border-canvas-line text-brand-600" />
              Required for course completion
            </label>
          </div>
        )}
      </Modal>
    </>
  )
}
