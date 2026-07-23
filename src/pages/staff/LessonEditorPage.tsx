import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Plus, Presentation, Trash2, Upload, Video } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAsyncData } from '../../lib/useAsyncData'
import { useToast } from '../../context/ToastContext'
import {
  Badge, Breadcrumbs, Button, Card, ConfirmDialog, ErrorState, Input, Modal, PageHeader,
  SectionHeading, Select, Spinner, Textarea,
} from '../../components/ui'
import { LESSON_TYPE_LABEL, readableError } from '../../lib/utils'
import { uploadAcademyMedia } from '../../lib/media'
import type { Lesson, LessonScreenshot, LessonSection, LessonType } from '../../lib/types'

const EMPTY_SECTION = {
  id: '', title: '', body: '',
  section_type: 'content' as LessonSection['section_type'],
  coach_only: false,
}
const EMPTY_SHOT = {
  id: '', step_number: 1, title: '', instruction: '', image_url: '',
  highlight_description: '', tip: '', warning: '', tool_version: '',
  captured_on: new Date().toISOString().slice(0, 10), device_type: 'desktop',
}

export default function LessonEditorPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const { notify } = useToast()
  const [draft, setDraft] = useState<Lesson | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [sectionForm, setSectionForm] = useState<typeof EMPTY_SECTION | null>(null)
  const [shotForm, setShotForm] = useState<typeof EMPTY_SHOT | null>(null)
  const [removing, setRemoving] = useState<{ table: 'lesson_sections' | 'lesson_screenshots'; id: string } | null>(null)

  const state = useAsyncData<{
    lesson: Lesson
    sections: LessonSection[]
    screenshots: LessonScreenshot[]
    courseTitle: string
    courseSlug: string
  }>(async () => {
    const { data: lesson, error } = await supabase
      .from('lessons').select('*').eq('id', lessonId).maybeSingle()
    if (error) throw error
    if (!lesson) throw new Error('That lesson could not be loaded.')
    const [sections, screenshots, course] = await Promise.all([
      supabase.from('lesson_sections').select('*').eq('lesson_id', lesson.id).order('sort_order'),
      supabase.from('lesson_screenshots').select('*').eq('lesson_id', lesson.id)
        .eq('is_archived', false).order('step_number'),
      supabase.from('courses').select('title, slug').eq('id', lesson.course_id).maybeSingle(),
    ])
    return {
      lesson: lesson as Lesson,
      sections: (sections.data ?? []) as LessonSection[],
      screenshots: (screenshots.data ?? []) as LessonScreenshot[],
      courseTitle: (course.data?.title as string) ?? 'Course',
      courseSlug: (course.data?.slug as string) ?? '',
    }
  }, [lessonId])

  useEffect(() => {
    if (state.data) setDraft(state.data.lesson)
  }, [state.data])

  const saveLesson = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const { error } = await supabase.from('lessons').update({
        title: draft.title.trim(),
        objective: draft.objective,
        description: draft.description,
        student_content: draft.student_content,
        coach_notes: draft.coach_notes,
        presentation_content: draft.presentation_content,
        examples: draft.examples,
        live_activity: draft.live_activity,
        type: draft.type,
        estimated_minutes: Number(draft.estimated_minutes) || 15,
        is_required: draft.is_required,
        preview_available: draft.preview_available,
        is_published: draft.is_published,
        recording_url: draft.recording_url || null,
      }).eq('id', draft.id)
      if (error) throw error
      notify('Lesson saved.')
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveSection = async () => {
    if (!sectionForm || !draft) return
    setSaving(true)
    try {
      const payload = {
        lesson_id: draft.id,
        title: sectionForm.title.trim(),
        body: sectionForm.body,
        section_type: sectionForm.section_type,
        coach_only: sectionForm.coach_only,
        sort_order: sectionForm.id
          ? undefined
          : (state.data?.sections.length ?? 0) + 1,
      }
      const { error } = sectionForm.id
        ? await supabase.from('lesson_sections').update({
            title: payload.title, body: payload.body,
            section_type: payload.section_type, coach_only: payload.coach_only,
          }).eq('id', sectionForm.id)
        : await supabase.from('lesson_sections').insert(payload)
      if (error) throw error
      notify(sectionForm.id ? 'Section updated.' : 'Section added.')
      setSectionForm(null)
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveShot = async () => {
    if (!shotForm || !draft) return
    setSaving(true)
    try {
      const payload = {
        lesson_id: draft.id,
        step_number: Number(shotForm.step_number) || 1,
        title: shotForm.title.trim(),
        instruction: shotForm.instruction,
        image_url: shotForm.image_url,
        highlight_description: shotForm.highlight_description,
        tip: shotForm.tip,
        warning: shotForm.warning,
        tool_version: shotForm.tool_version,
        captured_on: shotForm.captured_on || null,
        device_type: shotForm.device_type,
        sort_order: Number(shotForm.step_number) || 1,
      }
      const { error } = shotForm.id
        ? await supabase.from('lesson_screenshots').update(payload).eq('id', shotForm.id)
        : await supabase.from('lesson_screenshots').insert(payload)
      if (error) throw error
      notify(shotForm.id ? 'Step updated.' : 'Step added.')
      setShotForm(null)
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const confirmRemove = async () => {
    if (!removing) return
    try {
      const { error } = removing.table === 'lesson_screenshots'
        ? await supabase.from('lesson_screenshots').update({ is_archived: true }).eq('id', removing.id)
        : await supabase.from('lesson_sections').delete().eq('id', removing.id)
      if (error) throw error
      notify('Removed.')
      setRemoving(null)
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    }
  }

  if (state.loading || !draft) return <Spinner label="Loading lesson" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  const { sections, screenshots, courseTitle, courseSlug } = state.data!

  return (
    <>
      <Breadcrumbs items={[
        { label: 'Builder', to: '/builder' },
        { label: courseTitle, to: `/courses/${courseSlug}` },
        { label: draft.title },
      ]} />

      <PageHeader
        eyebrow="Lesson editor"
        title={draft.title}
        description="Student content is public to enrolled students. Coach notes never leave the staff view."
        action={
          <>
            <Link to={`/present/${draft.id}`}>
              <Button variant="outline"><Presentation className="h-4 w-4" aria-hidden />Present</Button>
            </Link>
            <Button onClick={saveLesson} loading={saving}>Save lesson</Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input label="Lesson title" value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Textarea label="Objective" value={draft.objective}
                  onChange={(e) => setDraft({ ...draft, objective: e.target.value })}
                  hint="One sentence: what the student will be able to do afterwards." />
              </div>
              <Select label="Lesson type" value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as LessonType })}>
                {Object.entries(LESSON_TYPE_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </Select>
              <Input label="Estimated minutes" type="number" min={1} value={draft.estimated_minutes}
                onChange={(e) => setDraft({ ...draft, estimated_minutes: Number(e.target.value) })} />
              <div className="sm:col-span-2 space-y-3">
                <Input
                  label={['video', 'recorded_zoom', 'tutorial'].includes(draft.type) ? 'Video link or embed URL' : 'Lesson action link'}
                  type="url" value={draft.recording_url ?? ''}
                  onChange={(e) => setDraft({ ...draft, recording_url: e.target.value })}
                  hint={['video', 'recorded_zoom', 'tutorial'].includes(draft.type)
                    ? 'Paste a YouTube, Vimeo, Loom, Google Drive, or direct MP4 link. The video appears at the top of the lesson.'
                    : 'Used for Zoom, downloads, or external lesson links depending on the lesson type.'} />
                {['video', 'recorded_zoom', 'tutorial'].includes(draft.type) && (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700 hover:bg-brand-100">
                    {uploadingVideo ? 'Uploading video...' : <><Upload className="h-4 w-4" aria-hidden />Upload MP4, WebM or MOV</>}
                    <input type="file" accept="video/mp4,video/webm,video/quicktime,video/ogg" className="hidden" disabled={uploadingVideo}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setUploadingVideo(true)
                        try {
                          const url = await uploadAcademyMedia(file, 'lesson-videos')
                          setDraft({ ...draft, recording_url: url })
                          notify('Video uploaded. Save the lesson to publish it.')
                        } catch (error) { notify(readableError(error), 'error') }
                        finally { setUploadingVideo(false); e.target.value = '' }
                      }} />
                  </label>
                )}
                {draft.recording_url && ['video', 'recorded_zoom', 'tutorial'].includes(draft.type) && (
                  <p className="flex items-center gap-2 text-xs text-emerald-700"><Video className="h-4 w-4" aria-hidden />Video is attached and will appear at the top of the lesson.</p>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <Textarea label="Student content" rows={8} value={draft.student_content}
              onChange={(e) => setDraft({ ...draft, student_content: e.target.value })}
              hint="Plain language. Assume no prior office experience." />
          </Card>

          <Card>
            <Textarea label="Worked example" rows={5} value={draft.examples}
              onChange={(e) => setDraft({ ...draft, examples: e.target.value })}
              hint="Show the finished thing, not just the theory." />
          </Card>

          <Card>
            <Textarea label="Practice activity" rows={5} value={draft.live_activity}
              onChange={(e) => setDraft({ ...draft, live_activity: e.target.value })}
              hint="What the student does during or after the live session." />
          </Card>

          <Card className="border-brand-200 bg-brand-50/50">
            <Textarea label="Coach notes" rows={6} value={draft.coach_notes}
              onChange={(e) => setDraft({ ...draft, coach_notes: e.target.value })}
              hint="Only Coaches, Managers and Owners can read this." />
          </Card>

          <Card>
            <Textarea label="Presentation slides" rows={6} value={draft.presentation_content}
              onChange={(e) => setDraft({ ...draft, presentation_content: e.target.value })}
              hint="One slide per line. Use 'Heading: body text' to set a slide title." />
          </Card>

          <div>
            <SectionHeading title="Lesson sections"
              description="Extra blocks shown under the main content."
              action={<Button size="sm" variant="secondary" onClick={() => setSectionForm({ ...EMPTY_SECTION })}>
                <Plus className="h-4 w-4" aria-hidden />Add section
              </Button>} />
            {sections.length === 0 ? (
              <Card><p className="text-sm text-ink-muted">No extra sections yet.</p></Card>
            ) : (
              <div className="space-y-3">
                {sections.map((section) => (
                  <Card key={section.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-ink">{section.title}</h3>
                          <Badge tone="neutral">{section.section_type.replace('_', ' ')}</Badge>
                          {section.coach_only && <Badge tone="warning">Coach only</Badge>}
                        </div>
                        <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{section.body}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setSectionForm({
                          id: section.id, title: section.title, body: section.body,
                          section_type: section.section_type, coach_only: section.coach_only,
                        })}>Edit</Button>
                        <Button size="sm" variant="ghost"
                          onClick={() => setRemoving({ table: 'lesson_sections', id: section.id })}
                          aria-label={`Delete section ${section.title}`}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionHeading title="Screenshot walkthrough"
              description="Numbered steps with an image, an instruction and optional tips."
              action={<Button size="sm" variant="secondary"
                onClick={() => setShotForm({ ...EMPTY_SHOT, step_number: screenshots.length + 1 })}>
                <Plus className="h-4 w-4" aria-hidden />Add step
              </Button>} />
            {screenshots.length === 0 ? (
              <Card><p className="text-sm text-ink-muted">No walkthrough steps yet.</p></Card>
            ) : (
              <div className="space-y-3">
                {screenshots.map((shot) => (
                  <Card key={shot.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                          {shot.step_number}
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-ink">{shot.title}</h3>
                          <p className="mt-1 text-sm text-ink-muted">{shot.instruction}</p>
                          <p className="mt-1 text-[11px] text-ink-soft">
                            {shot.tool_version || 'Version not recorded'} · {shot.device_type}
                            {shot.image_url ? '' : ' · no image yet'}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setShotForm({
                          id: shot.id, step_number: shot.step_number, title: shot.title,
                          instruction: shot.instruction, image_url: shot.image_url,
                          highlight_description: shot.highlight_description, tip: shot.tip,
                          warning: shot.warning, tool_version: shot.tool_version,
                          captured_on: shot.captured_on ?? '', device_type: shot.device_type,
                        })}>Edit</Button>
                        <Button size="sm" variant="ghost"
                          onClick={() => setRemoving({ table: 'lesson_screenshots', id: shot.id })}
                          aria-label={`Archive step ${shot.step_number}`}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="text-sm font-semibold text-ink">Publishing</h2>
            <div className="mt-3 space-y-3">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={draft.is_published}
                  onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })}
                  className="h-4 w-4 rounded border-canvas-line text-brand-600" />
                Published to students
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={draft.is_required}
                  onChange={(e) => setDraft({ ...draft, is_required: e.target.checked })}
                  className="h-4 w-4 rounded border-canvas-line text-brand-600" />
                Required for completion
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={draft.preview_available}
                  onChange={(e) => setDraft({ ...draft, preview_available: e.target.checked })}
                  className="h-4 w-4 rounded border-canvas-line text-brand-600" />
                Free preview for any student
              </label>
            </div>
            <Button className="mt-5 w-full" onClick={saveLesson} loading={saving}>Save lesson</Button>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-ink">Access rules</h2>
            <p className="mt-2 text-sm text-ink-muted">
              This lesson requires {draft.required_student_level.replace('_', ' ')}.
              Level and specialization rules are set on the course, and enforced again by the database.
            </p>
          </Card>
        </aside>
      </div>

      <Modal
        open={!!sectionForm} onClose={() => setSectionForm(null)} wide
        title={sectionForm?.id ? 'Edit section' : 'Add a section'}
        footer={
          <>
            <Button variant="outline" onClick={() => setSectionForm(null)}>Cancel</Button>
            <Button onClick={saveSection} loading={saving} disabled={!sectionForm?.title.trim()}>Save section</Button>
          </>
        }
      >
        {sectionForm && (
          <div className="space-y-4">
            <Input label="Section title" required value={sectionForm.title}
              onChange={(e) => setSectionForm({ ...sectionForm, title: e.target.value })} />
            <Textarea label="Body" rows={6} value={sectionForm.body}
              onChange={(e) => setSectionForm({ ...sectionForm, body: e.target.value })} />
            <Select label="Section type" value={sectionForm.section_type}
              onChange={(e) => setSectionForm({
                ...sectionForm, section_type: e.target.value as LessonSection['section_type'],
              })}>
              <option value="content">Content</option>
              <option value="example">Example</option>
              <option value="activity">Activity</option>
              <option value="coach_note">Coach note</option>
            </Select>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={sectionForm.coach_only}
                onChange={(e) => setSectionForm({ ...sectionForm, coach_only: e.target.checked })}
                className="h-4 w-4 rounded border-canvas-line text-brand-600" />
              Coach only — hidden from students by the database
            </label>
          </div>
        )}
      </Modal>

      <Modal
        open={!!shotForm} onClose={() => setShotForm(null)} wide
        title={shotForm?.id ? 'Edit step' : 'Add a walkthrough step'}
        description="Record the tool version and capture date so the step can be refreshed when the tool changes."
        footer={
          <>
            <Button variant="outline" onClick={() => setShotForm(null)}>Cancel</Button>
            <Button onClick={saveShot} loading={saving} disabled={!shotForm?.title.trim()}>Save step</Button>
          </>
        }
      >
        {shotForm && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Step number" type="number" min={1} value={shotForm.step_number}
              onChange={(e) => setShotForm({ ...shotForm, step_number: Number(e.target.value) })} />
            <Input label="Step title" required value={shotForm.title}
              onChange={(e) => setShotForm({ ...shotForm, title: e.target.value })} />
            <div className="sm:col-span-2">
              <Textarea label="Instruction" value={shotForm.instruction}
                onChange={(e) => setShotForm({ ...shotForm, instruction: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Input label="Image URL" type="url" value={shotForm.image_url}
                onChange={(e) => setShotForm({ ...shotForm, image_url: e.target.value })}
                hint="Upload to the screenshots bucket in Supabase, then paste the public URL." />
            </div>
            <div className="sm:col-span-2">
              <Input label="What to look for" value={shotForm.highlight_description}
                onChange={(e) => setShotForm({ ...shotForm, highlight_description: e.target.value })} />
            </div>
            <Input label="Tip" value={shotForm.tip}
              onChange={(e) => setShotForm({ ...shotForm, tip: e.target.value })} />
            <Input label="Warning" value={shotForm.warning}
              onChange={(e) => setShotForm({ ...shotForm, warning: e.target.value })} />
            <Input label="Tool version" value={shotForm.tool_version}
              onChange={(e) => setShotForm({ ...shotForm, tool_version: e.target.value })}
              hint="For example: Gmail web, July 2026" />
            <Input label="Captured on" type="date" value={shotForm.captured_on}
              onChange={(e) => setShotForm({ ...shotForm, captured_on: e.target.value })} />
            <Select label="Device" value={shotForm.device_type}
              onChange={(e) => setShotForm({ ...shotForm, device_type: e.target.value })}>
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
              <option value="tablet">Tablet</option>
            </Select>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!removing} onClose={() => setRemoving(null)} onConfirm={confirmRemove}
        title="Remove this item?"
        message="Students will no longer see it. Screenshot steps are archived and can be restored in Supabase."
        confirmLabel="Remove"
      />
    </>
  )
}
