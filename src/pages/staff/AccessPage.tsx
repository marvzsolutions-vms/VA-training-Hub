import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, ShieldCheck, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAsyncData } from '../../lib/useAsyncData'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  Badge, Button, Card, DataTable, EmptyState, ErrorState, Input, Modal, PageHeader, SearchInput,
  SectionHeading, Select, Spinner, StatCard, Textarea,
} from '../../components/ui'
import {
  ACCESS_SCOPE_LABEL, daysUntil, formatDate, LEVEL_SHORT, readableError, STATUS_LABEL,
} from '../../lib/utils'
import type {
  AccessScope, AccessStatus, Course, LearningLevel, Profile, Specialization, TemporaryAccess,
} from '../../lib/types'

interface GrantRow {
  id: string
  student_id: string
  level: LearningLevel | null
  course_id: string | null
  status: AccessStatus
  granted_at: string
  expires_at: string | null
  notes: string
  student: Pick<Profile, 'id' | 'full_name' | 'email'> | null
  courses: Pick<Course, 'id' | 'title'> | null
}

export default function AccessPage() {
  const { profile } = useAuth()
  const { notify } = useToast()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [granting, setGranting] = useState(false)
  const [tempOpen, setTempOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkIds, setBulkIds] = useState<string[]>([])
  const [bulkLevel, setBulkLevel] = useState<LearningLevel>('level_2')
  const [bulkNote, setBulkNote] = useState('')
  const [temp, setTemp] = useState({
    student_id: '', scope: 'course' as AccessScope, course_id: '', spec_id: '',
    level: 'level_2' as LearningLevel, days: 14, reason: '',
  })
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    student_id: '', level: 'level_2' as LearningLevel, course_id: '',
    status: 'approved' as AccessStatus, expires_at: '', notes: '',
  })

  const state = useAsyncData<{
    grants: GrantRow[]
    students: Array<Pick<Profile, 'id' | 'full_name' | 'email'>>
    courses: Course[]
    specializations: Specialization[]
    temporary: TemporaryAccess[]
  }>(async () => {
    const [grants, students, courses, specs, temporary] = await Promise.all([
      supabase.from('student_access')
        .select('*, student:profiles!student_access_student_id_fkey(id, full_name, email), courses(id, title)')
        .order('granted_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email').eq('role', 'student').order('full_name'),
      supabase.from('courses').select('id, title, slug, level').order('level').order('sort_order'),
      supabase.from('specializations').select('*').order('sort_order'),
      supabase.from('temporary_access')
        .select('*, student:profiles!temporary_access_student_id_fkey(id, full_name, email), courses(id, title), specializations(id, name)')
        .is('revoked_at', null).order('expires_at'),
    ])
    if (grants.error) throw grants.error
    return {
      grants: (grants.data ?? []) as unknown as GrantRow[],
      students: (students.data ?? []) as Array<Pick<Profile, 'id' | 'full_name' | 'email'>>,
      courses: (courses.data ?? []) as Course[],
      specializations: (specs.data ?? []) as Specialization[],
      temporary: (temporary.data ?? []) as TemporaryAccess[],
    }
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (state.data?.grants ?? []).filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!term) return true
      return (row.student?.full_name ?? '').toLowerCase().includes(term) ||
        (row.student?.email ?? '').toLowerCase().includes(term)
    })
  }, [state.data, search, statusFilter])

  const counts = useMemo(() => {
    const rows = state.data?.grants ?? []
    return {
      pending: rows.filter((r) => r.status === 'pending_approval').length,
      active: rows.filter((r) => r.status === 'approved' || r.status === 'active').length,
      expiring: rows.filter((r) => {
        if (!r.expires_at) return false
        const days = (new Date(r.expires_at).getTime() - Date.now()) / 86_400_000
        return days > 0 && days <= 14
      }).length,
    }
  }, [state.data])

  const setStatus = async (id: string, status: AccessStatus) => {
    try {
      const { error } = await supabase.from('student_access').update({ status }).eq('id', id)
      if (error) throw error
      notify(`Grant set to ${STATUS_LABEL[status].toLowerCase()}.`)
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    }
  }

  const grantTemporary = async () => {
    if (!temp.student_id || !profile) return
    setSaving(true)
    try {
      const expires = new Date(Date.now() + Number(temp.days) * 86_400_000).toISOString()
      const { error } = await supabase.from('temporary_access').insert({
        student_id: temp.student_id,
        scope: temp.scope,
        course_id: temp.scope === 'course' ? temp.course_id || null : null,
        spec_id: temp.scope === 'specialization' ? temp.spec_id || null : null,
        level: temp.scope === 'level' ? temp.level : null,
        expires_at: expires,
        reason: temp.reason,
        granted_by: profile.id,
      })
      if (error) throw error
      await supabase.from('notifications').insert({
        user_id: temp.student_id,
        title: 'Temporary access granted',
        body: `${ACCESS_SCOPE_LABEL[temp.scope]} for ${temp.days} days. ${temp.reason}`.trim(),
        link: '/courses',
      })
      notify('Temporary access granted. It expires automatically.')
      setTempOpen(false)
      setTemp({ ...temp, student_id: '', course_id: '', spec_id: '', reason: '' })
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally { setSaving(false) }
  }

  const revokeTemporary = async (id: string) => {
    try {
      const { error } = await supabase.from('temporary_access')
        .update({ revoked_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      notify('Temporary access revoked.')
      state.reload()
    } catch (error) { notify(readableError(error), 'error') }
  }

  /** Upgrades several students in one action. */
  const bulkUpgrade = async () => {
    if (!profile || bulkIds.length === 0) return
    setSaving(true)
    try {
      // current_level is the source of truth; do not create duplicate level grants.
      const { error: pErr } = await supabase.from('student_profiles').update({
        current_level: bulkLevel, access_status: 'active',
        upgraded_at: new Date().toISOString(), upgrade_approved_by: profile.id,
        upgrade_notes: bulkNote,
      }).in('user_id', bulkIds)
      if (pErr) throw pErr
      await supabase.from('notifications').insert(bulkIds.map((id) => ({
        user_id: id, title: 'Your level was updated',
        body: bulkNote || 'A Manager moved you to the next level.', link: '/courses',
      })))
      notify(`${bulkIds.length} student${bulkIds.length === 1 ? '' : 's'} upgraded.`)
      setBulkOpen(false); setBulkIds([]); setBulkNote('')
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally { setSaving(false) }
  }

  const createGrant = async () => {
    if (!form.student_id || !profile) return
    setSaving(true)
    try {
      if (form.course_id) {
        const { error } = await supabase.from('student_access').insert({
          student_id: form.student_id,
          level: null,
          course_id: form.course_id,
          status: form.status,
          granted_by: profile.id,
          expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
          notes: form.notes,
        })
        if (error) throw error
      } else {
        const { error } = await supabase.from('student_profiles').update({
          current_level: form.level,
          access_status: form.status,
          upgraded_at: new Date().toISOString(),
          upgrade_approved_by: profile.id,
          upgrade_notes: form.notes,
        }).eq('user_id', form.student_id)
        if (error) throw error
      }

      await supabase.from('notifications').insert({
        user_id: form.student_id,
        title: 'Your access was updated',
        body: form.notes || 'A Manager updated what you can reach in the academy.',
        link: '/courses',
      })

      notify('Access granted.')
      setGranting(false)
      setForm({ student_id: '', level: 'level_2', course_id: '', status: 'approved', expires_at: '', notes: '' })
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (state.loading) return <Spinner label="Loading access grants" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  return (
    <>
      <PageHeader
        title="Access control"
        description="Student levels come from the profile. Explicit grants are only for course exceptions and temporary access."
        action={
          <>
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <Users className="h-4 w-4" aria-hidden />Bulk upgrade
            </Button>
            <Button variant="outline" onClick={() => setTempOpen(true)}>
              <Clock className="h-4 w-4" aria-hidden />Temporary access
            </Button>
            <Button onClick={() => setGranting(true)}>
              <ShieldCheck className="h-4 w-4" aria-hidden />Grant access
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting approval" value={counts.pending} />
        <StatCard label="Active grants" value={counts.active} />
        <StatCard label="Expiring within 14 days" value={counts.expiring} />
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_200px]">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by student" label="Search grants" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </Select>
      </div>

      {state.data!.temporary.length > 0 && (
        <div className="mb-8">
          <SectionHeading title="Live temporary access"
            description="These expire on their own. The database stops honouring them the moment the window closes." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {state.data!.temporary.map((t) => {
              const left = daysUntil(t.expires_at)
              return (
                <Card key={t.id}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-ink">
                      {t.student?.full_name ?? 'Student'}
                    </p>
                    <Badge tone={left !== null && left <= 3 ? 'warning' : 'info'}>
                      {left !== null && left >= 0 ? `${left}d left` : 'expired'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {ACCESS_SCOPE_LABEL[t.scope]}
                    {t.courses ? ` · ${t.courses.title}` : ''}
                    {t.specializations ? ` · ${t.specializations.name}` : ''}
                    {t.level ? ` · ${LEVEL_SHORT[t.level]}` : ''}
                  </p>
                  {t.reason && <p className="mt-1 text-xs text-ink-soft">{t.reason}</p>}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-ink-soft">Ends {formatDate(t.expires_at)}</span>
                    <Button size="sm" variant="ghost" onClick={() => revokeTemporary(t.id)}>Revoke</Button>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      <SectionHeading title="Grants" />
      <DataTable
        rows={filtered}
        keyOf={(row) => row.id}
        empty={<EmptyState icon={ShieldCheck} title="No grants match that filter"
          description="Grant Level 2 or Level 3 access to move a student forward." />}
        columns={[
          {
            header: 'Student',
            cell: (row) => (
              <Link to={`/students/${row.student_id}`} className="rounded font-medium text-ink hover:text-brand-700">
                {row.student?.full_name ?? 'Unknown'}
                <span className="block text-xs font-normal text-ink-soft">{row.student?.email}</span>
              </Link>
            ),
          },
          {
            header: 'Scope',
            cell: (row) => row.courses
              ? <span className="text-xs">{row.courses.title}</span>
              : <Badge tone="info">{row.level ? LEVEL_SHORT[row.level] : 'All levels'}</Badge>,
          },
          {
            header: 'Status',
            cell: (row) => (
              <Badge tone={['approved', 'active'].includes(row.status) ? 'success'
                : ['suspended', 'expired', 'locked'].includes(row.status) ? 'danger' : 'warning'}>
                {STATUS_LABEL[row.status]}
              </Badge>
            ),
          },
          {
            header: 'Granted',
            cell: (row) => <span className="text-xs">{formatDate(row.granted_at)}</span>,
          },
          {
            header: 'Expires',
            cell: (row) => <span className="text-xs">{row.expires_at ? formatDate(row.expires_at) : 'No expiry'}</span>,
          },
          {
            header: 'Actions',
            cell: (row) => (
              <div className="flex flex-wrap gap-1">
                {row.status !== 'approved' && row.status !== 'active' && (
                  <Button size="sm" variant="secondary" onClick={() => setStatus(row.id, 'approved')}>Approve</Button>
                )}
                {row.status !== 'suspended' && (
                  <Button size="sm" variant="ghost" onClick={() => setStatus(row.id, 'suspended')}>Revoke</Button>
                )}
              </div>
            ),
          },
        ]}
      />

      <Modal
        open={granting} onClose={() => setGranting(false)} wide
        title="Grant access"
        description="Grant a whole level, or open a single course without changing the student level."
        footer={
          <>
            <Button variant="outline" onClick={() => setGranting(false)}>Cancel</Button>
            <Button onClick={createGrant} loading={saving} disabled={!form.student_id}>Grant access</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Select label="Student" required value={form.student_id}
              onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
              <option value="">Choose a student</option>
              {state.data!.students.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name} — {s.email}</option>
              ))}
            </Select>
          </div>
          <Select label="Level" value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value as LearningLevel })}
            hint="Ignored when a single course is chosen.">
            <option value="level_1">Level 1</option>
            <option value="level_2">Level 2</option>
            <option value="level_3">Level 3</option>
          </Select>
          <Select label="Single course instead" value={form.course_id}
            onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
            <option value="">Grant the whole level</option>
            {state.data!.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
          <Select label="Status" value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as AccessStatus })}>
            {Object.entries(STATUS_LABEL).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
          <Input label="Expires on" type="date" value={form.expires_at}
            onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            hint="Leave empty for permanent access." />
          <div className="sm:col-span-2">
            <Textarea label="Notes" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Why this access is being granted. The student sees this note." />
          </div>
        </div>
      </Modal>
      <Modal
        open={tempOpen} onClose={() => setTempOpen(false)} wide
        title="Grant temporary access"
        description="Lend a student a course, module, specialization or a whole level for a fixed window. It expires by itself."
        footer={
          <>
            <Button variant="outline" onClick={() => setTempOpen(false)}>Cancel</Button>
            <Button onClick={grantTemporary} loading={saving}
              disabled={!temp.student_id ||
                (temp.scope === 'course' && !temp.course_id) ||
                (temp.scope === 'specialization' && !temp.spec_id)}>
              Grant temporary access
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Select label="Student" required value={temp.student_id}
              onChange={(e) => setTemp({ ...temp, student_id: e.target.value })}>
              <option value="">Choose a student</option>
              {state.data!.students.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name} — {s.email}</option>
              ))}
            </Select>
          </div>
          <Select label="What to open" value={temp.scope}
            onChange={(e) => setTemp({ ...temp, scope: e.target.value as AccessScope })}>
            {Object.entries(ACCESS_SCOPE_LABEL).filter(([k]) => k !== 'module').map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <Input label="Days of access" type="number" min={1} max={365} value={temp.days}
            onChange={(e) => setTemp({ ...temp, days: Number(e.target.value) })} />
          {temp.scope === 'course' && (
            <div className="sm:col-span-2">
              <Select label="Course" required value={temp.course_id}
                onChange={(e) => setTemp({ ...temp, course_id: e.target.value })}>
                <option value="">Choose a course</option>
                {state.data!.courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </Select>
            </div>
          )}
          {temp.scope === 'specialization' && (
            <div className="sm:col-span-2">
              <Select label="Specialization" required value={temp.spec_id}
                onChange={(e) => setTemp({ ...temp, spec_id: e.target.value })}>
                <option value="">Choose a specialization</option>
                {state.data!.specializations.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
          )}
          {temp.scope === 'level' && (
            <div className="sm:col-span-2">
              <Select label="Level" value={temp.level}
                onChange={(e) => setTemp({ ...temp, level: e.target.value as LearningLevel })}>
                <option value="level_1">Level 1</option>
                <option value="level_2">Level 2</option>
                <option value="level_3">Level 3</option>
              </Select>
            </div>
          )}
          <div className="sm:col-span-2">
            <Textarea label="Reason" value={temp.reason}
              onChange={(e) => setTemp({ ...temp, reason: e.target.value })}
              placeholder="Why this student is getting early access, and what they should do with it." />
          </div>
        </div>
      </Modal>

      <Modal
        open={bulkOpen} onClose={() => setBulkOpen(false)} wide
        title="Bulk upgrade students"
        description="Moves everyone selected to the same level and records a grant for each."
        footer={
          <>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={bulkUpgrade} loading={saving} disabled={bulkIds.length === 0}>
              Upgrade {bulkIds.length || ''} student{bulkIds.length === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select label="New level" value={bulkLevel}
            onChange={(e) => setBulkLevel(e.target.value as LearningLevel)}>
            <option value="level_1">Level 1</option>
            <option value="level_2">Level 2</option>
            <option value="level_3">Level 3</option>
          </Select>
          <div>
            <p className="field-label">Students</p>
            <div className="mt-1 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-canvas-line p-2">
              {state.data!.students.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-canvas">
                  <input type="checkbox" checked={bulkIds.includes(s.id)}
                    onChange={(e) => setBulkIds(e.target.checked
                      ? [...bulkIds, s.id]
                      : bulkIds.filter((x) => x !== s.id))}
                    className="h-4 w-4 rounded border-canvas-line text-brand-600" />
                  <span className="min-w-0 truncate">{s.full_name}</span>
                  <span className="ml-auto truncate text-xs text-ink-soft">{s.email}</span>
                </label>
              ))}
            </div>
          </div>
          <Textarea label="Reason" value={bulkNote} onChange={(e) => setBulkNote(e.target.value)}
            placeholder="Recorded against every student and shown in their notification." />
        </div>
      </Modal>
    </>
  )
}
