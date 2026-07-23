import { useMemo, useState } from 'react'
import { CalendarPlus, Plus, Video } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAsyncData } from '../lib/useAsyncData'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { isStaff } from '../lib/access'
import {
  Badge, Button, Card, EmptyState, ErrorState, ExternalLink, Input, Modal, PageHeader,
  SectionHeading, Select, Spinner, Textarea,
} from '../components/ui'
import { formatDate, formatTime, readableError } from '../lib/utils'
import type { Batch, Course, LiveSession } from '../lib/types'

const EMPTY = {
  title: '', description: '', course_id: '', batch_id: '', session_date: '',
  start_time: '19:00', end_time: '20:30', zoom_url: '', meeting_id: '', passcode: '',
}

function downloadCalendarEntry(session: LiveSession) {
  const start = `${session.session_date.replace(/-/g, '')}T${session.start_time.replace(/:/g, '').slice(0, 6)}`
  const end = `${session.session_date.replace(/-/g, '')}T${session.end_time.replace(/:/g, '').slice(0, 6)}`
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VA Success Academy//EN', 'BEGIN:VEVENT',
    `UID:${session.id}@vasuccessacademy`,
    `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${session.title}`,
    `DESCRIPTION:${(session.description || '').replace(/\n/g, ' ')}`,
    `LOCATION:${session.zoom_url ?? 'Zoom'}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')

  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${session.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`
  link.click()
  URL.revokeObjectURL(url)
}

export default function SessionsPage() {
  const { profile, role } = useAuth()
  const { notify } = useToast()
  const staff = isStaff(role)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({ ...EMPTY })

  const state = useAsyncData<{ sessions: LiveSession[]; courses: Course[]; batches: Batch[] }>(async () => {
    const [sessions, courses, batches] = await Promise.all([
      supabase.from('live_sessions')
        .select('*, courses(id, title), batches(id, code, name)')
        .order('session_date', { ascending: false }).order('start_time'),
      supabase.from('courses').select('id, title, slug, level').order('sort_order'),
      supabase.from('batches').select('id, code, name').eq('is_active', true).order('code'),
    ])
    if (sessions.error) throw sessions.error
    return {
      sessions: (sessions.data ?? []) as LiveSession[],
      courses: (courses.data ?? []) as Course[],
      batches: (batches.data ?? []) as Batch[],
    }
  }, [profile?.id])

  const { upcoming, past } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const rows = state.data?.sessions ?? []
    return {
      upcoming: rows.filter((s) => s.session_date >= today && s.status !== 'cancelled')
        .sort((a, b) => a.session_date.localeCompare(b.session_date)),
      past: rows.filter((s) => s.session_date < today || s.status === 'completed'),
    }
  }, [state.data])

  const create = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('live_sessions').insert({
        title: draft.title.trim(),
        description: draft.description,
        course_id: draft.course_id || null,
        batch_id: draft.batch_id || null,
        coach_id: profile?.id ?? null,
        session_date: draft.session_date,
        start_time: draft.start_time,
        end_time: draft.end_time,
        zoom_url: draft.zoom_url || null,
        meeting_id: draft.meeting_id || null,
        passcode: draft.passcode || null,
      })
      if (error) throw error
      notify('Session scheduled.')
      setCreating(false)
      setDraft({ ...EMPTY })
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (state.loading) return <Spinner label="Loading sessions" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  const SessionCard = ({ session }: { session: LiveSession }) => (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{session.title}</h3>
          <p className="mt-0.5 text-sm text-ink-muted">{session.description}</p>
          <p className="mt-2 text-xs text-ink-soft">
            {formatDate(session.session_date)} · {formatTime(session.start_time)}–{formatTime(session.end_time)} {session.time_zone}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {session.courses && <Badge tone="neutral">{session.courses.title}</Badge>}
            {session.batches && <Badge tone="brand">{session.batches.code}</Badge>}
            <Badge tone={session.status === 'completed' ? 'neutral' : session.status === 'live' ? 'success' : 'info'}>
              {session.status}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {session.zoom_url && session.status !== 'completed' && (
            <ExternalLink href={session.zoom_url}>
              <Button size="sm"><Video className="h-4 w-4" aria-hidden />Join Zoom</Button>
            </ExternalLink>
          )}
          {session.recording_url && (
            <ExternalLink href={session.recording_url}>
              <Button size="sm" variant="secondary">Watch recording</Button>
            </ExternalLink>
          )}
          <Button size="sm" variant="outline" onClick={() => downloadCalendarEntry(session)}>
            <CalendarPlus className="h-4 w-4" aria-hidden />Add to calendar
          </Button>
        </div>
      </div>
      {(session.meeting_id || session.passcode) && session.status !== 'completed' && (
        <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-muted">
          Meeting ID {session.meeting_id ?? '—'} · Passcode {session.passcode ?? '—'}
        </p>
      )}
    </Card>
  )

  return (
    <>
      <PageHeader
        title="Zoom sessions"
        description="Live classes for your batch and courses, plus recordings when they are ready."
        action={staff && (
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden />Schedule a session</Button>
        )}
      />

      <SectionHeading title="Upcoming" />
      {upcoming.length === 0 ? (
        <EmptyState icon={Video} title="Nothing scheduled yet"
          description={staff ? 'Schedule a live session for a batch or course.' : 'Your coach will post the next session here.'} />
      ) : (
        <div className="space-y-4">{upcoming.map((s) => <SessionCard key={s.id} session={s} />)}</div>
      )}

      {past.length > 0 && (
        <div className="mt-10">
          <SectionHeading title="Past sessions" description="Recordings appear here when they are uploaded." />
          <div className="space-y-4">{past.map((s) => <SessionCard key={s.id} session={s} />)}</div>
        </div>
      )}

      <Modal
        open={creating} onClose={() => setCreating(false)} wide
        title="Schedule a Zoom session"
        description="Students see sessions for their own course or batch only."
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={create} loading={saving}
              disabled={!draft.title.trim() || !draft.session_date}>Schedule session</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input label="Title" required value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Description" value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <Select label="Course" value={draft.course_id}
            onChange={(e) => setDraft({ ...draft, course_id: e.target.value })}>
            <option value="">No specific course</option>
            {state.data!.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
          <Select label="Batch" value={draft.batch_id}
            onChange={(e) => setDraft({ ...draft, batch_id: e.target.value })}>
            <option value="">All batches</option>
            {state.data!.batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Input label="Date" type="date" required value={draft.session_date}
            onChange={(e) => setDraft({ ...draft, session_date: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start" type="time" value={draft.start_time}
              onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} />
            <Input label="End" type="time" value={draft.end_time}
              onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Input label="Zoom link" type="url" value={draft.zoom_url}
              onChange={(e) => setDraft({ ...draft, zoom_url: e.target.value })} />
          </div>
          <Input label="Meeting ID" value={draft.meeting_id}
            onChange={(e) => setDraft({ ...draft, meeting_id: e.target.value })} />
          <Input label="Passcode" value={draft.passcode}
            onChange={(e) => setDraft({ ...draft, passcode: e.target.value })} />
        </div>
      </Modal>
    </>
  )
}
