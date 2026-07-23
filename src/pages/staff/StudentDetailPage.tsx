import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAsyncData } from '../../lib/useAsyncData'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { isManagerUp } from '../../lib/access'
import {
  Badge, Breadcrumbs, Button, Card, ErrorState, Input, Modal, PageHeader, ProgressBar,
  SectionHeading, Select, Spinner, Textarea,
} from '../../components/ui'
import {
  formatDate, LEVEL_LABEL, LEVEL_SHORT, readableError, relativeDays, STATUS_LABEL,
} from '../../lib/utils'
import type {
  AccessStatus, Enrollment, LearningLevel, Profile, Specialization, StudentAccessGrant, StudentProfile,
} from '../../lib/types'

interface Bundle {
  profile: Profile
  student: StudentProfile
  enrollments: Enrollment[]
  grants: StudentAccessGrant[]
  specializations: Specialization[]
  studentSpecIds: string[]
  history: Array<{ id: string; from_level: string | null; to_level: string; reason: string; created_at: string }>
  coaches: Pick<Profile, 'id' | 'full_name' | 'email'>[]
}

export default function StudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>()
  const { profile: me, role } = useAuth()
  const { notify } = useToast()
  const canManage = isManagerUp(role)
  const [upgrading, setUpgrading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingReferral, setSavingReferral] = useState(false)
  const [form, setForm] = useState({
    level: 'level_2' as LearningLevel,
    status: 'approved' as AccessStatus,
    notes: '',
    expires_at: '',
    specialization_id: '',
  })

  const state = useAsyncData<Bundle>(async () => {
    const [profileRes, studentRes, enrollments, grants, specs, studentSpecs, history, coaches] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', studentId).maybeSingle(),
      supabase.from('student_profiles').select('*').eq('user_id', studentId).maybeSingle(),
      supabase.from('course_enrollments').select('*, courses(*)').eq('student_id', studentId),
      supabase.from('student_access').select('*').eq('student_id', studentId)
        .order('granted_at', { ascending: false }),
      supabase.from('specializations').select('*').order('sort_order'),
      supabase.from('student_specializations').select('specialization_id').eq('student_id', studentId),
      supabase.from('student_level_history').select('*').eq('student_id', studentId)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email').eq('role', 'coach').eq('is_active', true).order('full_name'),
    ])
    if (!profileRes.data) throw new Error('That student record is not available to your account.')
    return {
      profile: profileRes.data as Profile,
      student: studentRes.data as StudentProfile,
      enrollments: (enrollments.data ?? []) as Enrollment[],
      grants: (grants.data ?? []) as StudentAccessGrant[],
      specializations: (specs.data ?? []) as Specialization[],
      studentSpecIds: (studentSpecs.data ?? []).map((s: { specialization_id: string }) => s.specialization_id),
      history: (history.data ?? []) as Bundle['history'],
      coaches: (coaches.data ?? []) as Bundle['coaches'],
    }
  }, [studentId])


  const assignReferral = async (coachId: string) => {
    if (!studentId || !canManage) return
    setSavingReferral(true)
    try {
      const { error } = await supabase.from('student_profiles').update({ referred_by_coach: coachId || null }).eq('user_id', studentId)
      if (error) throw error
      notify(coachId ? 'Referral coach assigned.' : 'Referral coach removed.')
      state.reload()
    } catch (error) { notify(readableError(error), 'error') }
    finally { setSavingReferral(false) }
  }

  const applyUpgrade = async () => {
    if (!studentId || !me) return
    setSaving(true)
    try {
      const previous = state.data?.student.current_level ?? null
      const { error: profileError } = await supabase.from('student_profiles').update({
        current_level: form.level,
        access_status: form.status,
        upgraded_at: new Date().toISOString(),
        upgrade_approved_by: me.id,
        upgrade_notes: form.notes,
      }).eq('user_id', studentId)
      if (profileError) throw profileError

      await supabase.from('student_level_history').insert({
        student_id: studentId,
        from_level: previous,
        to_level: form.level,
        reason: form.notes || 'Access granted by staff.',
        approved_by: me.id,
      })

      if (form.specialization_id) {
        await supabase.from('student_specializations').insert({
          student_id: studentId,
          specialization_id: form.specialization_id,
          granted_by: me.id,
        })
      }

      await supabase.from('notifications').insert({
        user_id: studentId,
        title: `${LEVEL_SHORT[form.level]} access granted`,
        body: form.notes || 'Your Manager has updated your learning level.',
        link: '/courses',
      })

      notify('Access updated.')
      setUpgrading(false)
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (status: AccessStatus) => {
    if (!studentId) return
    try {
      const { error } = await supabase.from('student_profiles')
        .update({ access_status: status }).eq('user_id', studentId)
      if (error) throw error
      notify(`Status set to ${STATUS_LABEL[status].toLowerCase()}.`)
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    }
  }

  if (state.loading) return <Spinner label="Loading student" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  const { profile, student, enrollments, grants, specializations, studentSpecIds, history, coaches } = state.data!

  return (
    <>
      <Breadcrumbs items={[{ label: 'Students', to: '/students' }, { label: profile.full_name }]} />
      <PageHeader
        eyebrow={student ? LEVEL_SHORT[student.current_level] : undefined}
        title={profile.full_name}
        description={`${profile.email}${profile.city ? ` · ${profile.city}` : ''}`}
        action={canManage && student && (
          <Button onClick={() => setUpgrading(true)}>
            <ShieldCheck className="h-4 w-4" aria-hidden />Manage access
          </Button>
        )}
      />

      {student && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-xs uppercase tracking-wide text-ink-soft">Level</p>
            <p className="mt-1 font-semibold text-ink">{LEVEL_LABEL[student.current_level]}</p>
            <div className="mt-3"><ProgressBar value={Number(student.level_progress)} label="Level progress" /></div>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-ink-soft">Access status</p>
            <p className="mt-1 font-semibold text-ink">{STATUS_LABEL[student.access_status]}</p>
            <p className="mt-2 text-xs text-ink-soft">Last active {relativeDays(student.last_activity_at)}</p>
            {canManage && (
              <div className="mt-3 flex flex-wrap gap-2">
                {student.access_status !== 'active' && (
                  <Button size="sm" variant="secondary" onClick={() => setStatus('active')}>Activate</Button>
                )}
                {student.access_status !== 'suspended' && (
                  <Button size="sm" variant="outline" onClick={() => setStatus('suspended')}>Suspend</Button>
                )}
              </div>
            )}
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-ink-soft">Eligibility</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={student.level2_eligible ? 'success' : 'neutral'}>
                Level 2 {student.level2_eligible ? 'eligible' : 'not yet'}
              </Badge>
              <Badge tone={student.level3_eligible ? 'success' : 'neutral'}>
                Level 3 {student.level3_eligible ? 'eligible' : 'not yet'}
              </Badge>
            </div>
            <p className="mt-3 text-xs text-ink-muted">{student.recommended_next_step}</p>
          </Card>
        </div>
      )}

      {student && <Card className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs uppercase tracking-wide text-ink-soft">Referral ownership</p><p className="mt-1 text-sm text-ink-muted">Coaches see “My referral” only for students assigned to them. Managers and owners can see all coach assignments.</p></div>
          {canManage ? <div className="min-w-64"><Select label="Referred/enrolled by coach" value={student.referred_by_coach ?? ''} disabled={savingReferral} onChange={(e) => assignReferral(e.target.value)}><option value="">Not assigned</option>{coaches.map(c => <option key={c.id} value={c.id}>{c.full_name} — {c.email}</option>)}</Select></div> : student.referred_by_coach === me?.id ? <Badge tone="brand">My referral student</Badge> : <Badge tone="neutral">Standard student</Badge>}
        </div>
      </Card>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeading title="Course progress records" description="Standard courses unlock automatically by level; rows appear here once progress is recorded or a course is explicitly assigned." />
          <Card className="divide-y divide-canvas-line p-0">
            {enrollments.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-muted">No course progress records yet. Level-based course access does not require manual enrollment.</p>
            ) : enrollments.map((enrollment) => (
              <div key={enrollment.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium text-ink">{enrollment.courses?.title}</p>
                  <Badge tone={enrollment.status === 'completed' ? 'success' : 'brand'}>
                    {STATUS_LABEL[enrollment.status]}
                  </Badge>
                </div>
                <div className="mt-2"><ProgressBar value={Number(enrollment.progress)} /></div>
              </div>
            ))}
          </Card>

          <div className="mt-6">
            <SectionHeading title="Specializations" />
            <Card>
              <div className="flex flex-wrap gap-2">
                {studentSpecIds.length === 0 ? (
                  <p className="text-sm text-ink-muted">No specialization selected yet.</p>
                ) : specializations.filter((s) => studentSpecIds.includes(s.id)).map((s) => (
                  <Badge key={s.id} tone="brand">{s.name}</Badge>
                ))}
              </div>
            </Card>
          </div>
        </div>

        <div>
          <SectionHeading title="Access grants" />
          <Card className="divide-y divide-canvas-line p-0">
            {grants.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-muted">No explicit grants. Access follows the student level.</p>
            ) : grants.map((grant) => (
              <div key={grant.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-ink">
                    {grant.level ? LEVEL_SHORT[grant.level] : 'Single course'}
                  </p>
                  <Badge tone={grant.status === 'approved' || grant.status === 'active' ? 'success' : 'warning'}>
                    {STATUS_LABEL[grant.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-ink-muted">{grant.notes || 'No notes.'}</p>
                <p className="mt-1 text-[11px] text-ink-soft">
                  Granted {formatDate(grant.granted_at)}
                  {grant.expires_at ? ` · expires ${formatDate(grant.expires_at)}` : ' · no expiry'}
                </p>
              </div>
            ))}
          </Card>

          <div className="mt-6">
            <SectionHeading title="Level history" />
            <Card className="divide-y divide-canvas-line p-0">
              {history.length === 0 ? (
                <p className="px-4 py-6 text-sm text-ink-muted">No level changes recorded.</p>
              ) : history.map((entry) => (
                <div key={entry.id} className="px-4 py-3">
                  <p className="text-sm text-ink">
                    {entry.from_level ? `${entry.from_level.replace('_', ' ')} → ` : ''}
                    {entry.to_level.replace('_', ' ')}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">{entry.reason}</p>
                  <p className="mt-0.5 text-[11px] text-ink-soft">{formatDate(entry.created_at)}</p>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>

      <Modal
        open={upgrading} onClose={() => setUpgrading(false)} wide
        title="Manage learning access"
        description="Grants are recorded with your name and take effect immediately."
        footer={
          <>
            <Button variant="outline" onClick={() => setUpgrading(false)}>Cancel</Button>
            <Button onClick={applyUpgrade} loading={saving}>Apply access change</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="New learning level" value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value as LearningLevel })}>
            <option value="level_1">Level 1 — Beginner Foundations</option>
            <option value="level_2">Level 2 — Job-Ready Specialization</option>
            <option value="level_3">Level 3 — Advanced Skills</option>
          </Select>
          <Select label="Access status" value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as AccessStatus })}>
            {Object.entries(STATUS_LABEL).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
          <Select label="Add specialization" value={form.specialization_id}
            onChange={(e) => setForm({ ...form, specialization_id: e.target.value })}
            hint="Required for Level 2 and Level 3 courses.">
            <option value="">No change</option>
            {specializations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input label="Expires on" type="date" value={form.expires_at}
            onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            hint="Leave empty for permanent access." />
          <div className="sm:col-span-2">
            <Textarea label="Access notes" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Why this access is being granted. The student sees this in their notification." />
          </div>
        </div>
      </Modal>
    </>
  )
}
