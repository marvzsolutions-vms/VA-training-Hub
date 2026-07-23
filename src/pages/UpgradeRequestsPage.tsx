import { useMemo, useState } from 'react'
import { ArrowUpCircle, CheckCircle2, LockKeyhole, Plus, Send, ThumbsUp, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { uploadAcademyMedia } from '../lib/media'
import { useAsyncData } from '../lib/useAsyncData'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { isManagerUp, isStaff } from '../lib/access'
import {
  Badge, Button, Card, EmptyState, ErrorState, Modal, PageHeader, SectionHeading,
  Input, Select, Spinner, Textarea,
} from '../components/ui'
import {
  formatDate, formatDateTime, LEVEL_LABEL, readableError, relativeDays, UPGRADE_STATUS_LABEL,
} from '../lib/utils'
import type {
  LearningLevel, Specialization, UpgradeApproval, UpgradeEligibility, UpgradeInternalNote, UpgradeRequest, UpgradeStatus,
} from '../lib/types'

const TONE: Record<UpgradeStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'brand'> = {
  draft: 'neutral', submitted: 'info', under_review: 'info',
  more_information_required: 'warning', recommended: 'brand',
  approved: 'success', declined: 'danger', cancelled: 'neutral',
}

const refreshUpgradeRequestBadge = () => {
  window.dispatchEvent(new Event('upgrade-request-badge:refresh'))
}

export default function UpgradeRequestsPage() {
  const { profile, role } = useAuth()
  const { notify } = useToast()
  const staff = isStaff(role)
  const canDecide = isManagerUp(role)
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | UpgradeStatus>('open')
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [postingInternalNote, setPostingInternalNote] = useState(false)
  const [draft, setDraft] = useState({ student_id: '', level: '' as '' | LearningLevel, spec: '', reason: '', is_paid: false, amount: '', proof_url: '' })
  const [uploadingProof, setUploadingProof] = useState(false)

  const state = useAsyncData<{
    requests: UpgradeRequest[]
    specializations: Specialization[]
    eligibility: UpgradeEligibility | null
    coachMayApprove: boolean
    students: Array<{id:string;full_name:string;email:string}>
  }>(async () => {
    const [requests, specs, elig, settings, students] = await Promise.all([
      supabase.from('student_upgrade_requests')
        .select('*, student:profiles!student_upgrade_requests_student_id_fkey(id, full_name, email), specializations(id, name)')
        .order('created_at', { ascending: false }),
      supabase.from('specializations').select('*').order('sort_order'),
      profile && !staff
        ? supabase.rpc('upgrade_eligibility', { uid: profile.id })
        : Promise.resolve({ data: null }),
      supabase.from('system_settings').select('key, value')
        .in('key', ['perm.coach_approve_upgrade', 'perm.students_request_upgrade']),
      supabase.from('profiles').select('id,full_name,email').eq('role','student').eq('is_active',true).order('full_name'),
    ])
    if (requests.error) throw requests.error
    const flags = Object.fromEntries(
      ((settings.data ?? []) as Array<{ key: string; value: string }>)
        .map((s) => [s.key, s.value === 'true']))
    return {
      requests: (requests.data ?? []) as UpgradeRequest[],
      specializations: (specs.data ?? []) as Specialization[],
      eligibility: (elig.data as UpgradeEligibility) ?? null,
      coachMayApprove: !!flags['perm.coach_approve_upgrade'],
      students: (students.data ?? []) as Array<{id:string;full_name:string;email:string}>,
    }
  }, [profile?.id, staff])

  const internalNotes = useAsyncData<UpgradeInternalNote[]>(async () => {
    if (!selected || !staff) return []
    const { data, error } = await supabase.from('student_upgrade_internal_notes')
      .select('*, author:profiles!student_upgrade_internal_notes_author_id_fkey(id, full_name, role)')
      .eq('request_id', selected).order('created_at')
    if (error) throw error
    return (data ?? []) as UpgradeInternalNote[]
  }, [selected, staff])

  const trail = useAsyncData<UpgradeApproval[]>(async () => {
    if (!selected) return []
    const { data, error } = await supabase.from('student_upgrade_approvals')
      .select('*, actor:profiles!student_upgrade_approvals_actor_id_fkey(full_name, role)')
      .eq('request_id', selected).order('created_at')
    if (error) throw error
    return (data ?? []) as UpgradeApproval[]
  }, [selected])

  const rows = useMemo(() => {
    const all = state.data?.requests ?? []
    if (statusFilter === 'all') return all
    if (statusFilter === 'open') {
      return all.filter((r) => !['approved', 'declined', 'cancelled'].includes(r.status))
    }
    return all.filter((r) => r.status === statusFilter)
  }, [state.data, statusFilter])

  const current = rows.find((r) => r.id === selected)
    ?? (state.data?.requests ?? []).find((r) => r.id === selected) ?? null

  const logAction = async (requestId: string, action: string,
                          from: UpgradeStatus, to: UpgradeStatus, notes: string) => {
    await supabase.from('student_upgrade_approvals').insert({
      request_id: requestId, actor_id: profile?.id ?? null, actor_role: role,
      action, from_status: from, to_status: to, notes,
    })
  }

  const submitRequest = async () => {
    if (!profile) return
    setSaving(true)
    try {
      const { error } = await supabase.from('student_upgrade_requests').insert({
        student_id: role === 'coach' ? draft.student_id : profile.id,
        requested_level: draft.level || null,
        requested_spec_id: draft.spec || null,
        reason: draft.reason.trim(),
        status: 'submitted',
        eligibility_snapshot: state.data?.eligibility ?? {},
        is_paid: draft.is_paid,
        payment_amount: draft.amount ? Number(draft.amount) : 0,
        payment_proof_url: draft.proof_url || null,
        requested_by: profile.id,
      })
      if (error) throw error
      notify('Request sent. Your coach and Manager will review it.')
      setCreating(false)
      setDraft({ student_id: '', level: '', spec: '', reason: '', is_paid: false, amount: '', proof_url: '' })
      state.reload()
      refreshUpgradeRequestBadge()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const addInternalNote = async () => {
    if (!current || !profile || !internalNote.trim()) return
    setPostingInternalNote(true)
    try {
      const { error } = await supabase.from('student_upgrade_internal_notes').insert({
        request_id: current.id,
        author_id: profile.id,
        body: internalNote.trim(),
      })
      if (error) throw error
      setInternalNote('')
      internalNotes.reload()
      notify('Internal note added. Only coaches, managers, and owners can see it.')
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setPostingInternalNote(false)
    }
  }

  /** Moves the request and records who did it. */
  const advance = async (to: UpgradeStatus, action: string) => {
    if (!current || !profile) return
    setSaving(true)
    try {
      const patch: Record<string, unknown> = { status: to }
      if (action === 'recommend' || action === 'not_recommended') {
        patch.coach_id = profile.id
        patch.coach_recommended = action === 'recommend'
        patch.coach_notes = note
        patch.coach_reviewed_at = new Date().toISOString()
      } else if (to === 'under_review' || to === 'more_information_required') {
        patch.manager_id = profile.id
        patch.manager_notes = note
        patch.manager_reviewed_at = new Date().toISOString()
      } else if (to === 'approved' || to === 'declined') {
        patch.decision_notes = note
        patch.decided_by = profile.id
        patch.decided_at = new Date().toISOString()
      }

      const { error } = await supabase.from('student_upgrade_requests')
        .update(patch).eq('id', current.id)
      if (error) throw error
      await logAction(current.id, action, current.status, to, note)

      // Permanent level access comes only from student_profiles.current_level.
      if (to === 'approved' && current.requested_level) {
        await supabase.from('student_profiles').update({
          current_level: current.requested_level,
          access_status: 'active',
          upgraded_at: new Date().toISOString(),
          upgrade_approved_by: profile.id,
          upgrade_notes: note,
        }).eq('user_id', current.student_id)
      }
      if (to === 'approved' && current.requested_spec_id) {
        await supabase.from('specialization_access').upsert({
          student_id: current.student_id,
          spec_id: current.requested_spec_id,
          status: 'active',
          approved_by: profile.id,
          approval_notes: note,
        }, { onConflict: 'student_id,spec_id' })
      }

      await supabase.from('notifications').insert({
        user_id: current.student_id,
        title: to === 'approved' ? 'Your upgrade was approved'
             : to === 'declined' ? 'Your upgrade request was declined'
             : 'Your upgrade request was updated',
        body: note || UPGRADE_STATUS_LABEL[to],
        link: '/upgrades',
      })

      notify(`Request ${UPGRADE_STATUS_LABEL[to].toLowerCase()}.`)
      setNote('')
      state.reload(); trail.reload()
      refreshUpgradeRequestBadge()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (state.loading) return <Spinner label="Loading upgrade requests" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  const elig = state.data!.eligibility
  const coachMayApprove = state.data!.coachMayApprove
  const myOpen = (state.data!.requests ?? []).find(
    (r) => r.student_id === profile?.id && !['approved', 'declined', 'cancelled'].includes(r.status))

  return (
    <>
      <PageHeader
        title={staff ? 'Upgrade requests' : 'Your level and upgrades'}
        description={staff
          ? 'Review readiness, recommend, and approve or decline level changes.'
          : 'Where you are now, what is left, and how to ask for the next level.'}
        action={((!staff && elig?.can_request && !myOpen) || role === 'coach') && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />Request an upgrade
          </Button>
        )}
      />

      {/* Student-facing progress panel */}
      {!staff && elig && (
        <Card className="mb-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-soft">Current level</p>
              <p className="mt-1 font-semibold text-ink">{LEVEL_LABEL[elig.current_level]}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-soft">Level 1 courses</p>
              <p className="mt-1 font-semibold text-ink">
                {elig.level1_courses_done} of {elig.level1_courses_total} complete
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-soft">Eligibility</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge tone={elig.eligible_level2 ? 'success' : 'neutral'}>
                  Level 2 {elig.eligible_level2 ? 'eligible' : 'not yet'}
                </Badge>
                <Badge tone={elig.eligible_level3 ? 'success' : 'neutral'}>
                  Level 3 {elig.eligible_level3 ? 'eligible' : 'not yet'}
                </Badge>
              </div>
            </div>
          </div>
          <p className="mt-4 rounded-lg bg-canvas px-3 py-2 text-sm text-ink-muted">
            {elig.eligible_level2 && !myOpen
              ? 'You have finished the Level 1 requirements. You can request Level 2 now.'
              : myOpen
              ? `Your request is ${UPGRADE_STATUS_LABEL[myOpen.status].toLowerCase()}. We will let you know as soon as it moves.`
              : 'Finish your remaining Level 1 courses to unlock the next step. Being eligible does not grant access on its own — a Manager reviews every upgrade.'}
          </p>
        </Card>
      )}

      <div className="mb-5 max-w-xs">
        <Select value={statusFilter} aria-label="Filter by status"
          onChange={(e) => setStatusFilter(e.target.value as 'open' | 'all' | UpgradeStatus)}>
          <option value="open">Open requests</option>
          <option value="all">All requests</option>
          {Object.entries(UPGRADE_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ArrowUpCircle}
          title={staff ? 'No requests in this view' : 'No upgrade requests yet'}
          description={staff
            ? 'Nothing matches that filter right now.'
            : 'When you are ready for the next level, send a request and your coach will review it.'} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
          <div className="space-y-2">
            {rows.map((r) => (
              <button key={r.id} type="button" onClick={() => setSelected(r.id)}
                className={`card w-full p-4 text-left transition-colors hover:border-brand-200 ${
                  selected === r.id ? 'border-brand-300 bg-brand-50/50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {staff ? r.student?.full_name ?? 'Student' : 'Your request'}
                  </p>
                  <Badge tone={TONE[r.status]}>{UPGRADE_STATUS_LABEL[r.status]}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  {r.requested_level ? LEVEL_LABEL[r.requested_level] : ''}
                  {r.specializations ? ` · ${r.specializations.name}` : ''} · {relativeDays(r.created_at)}
                </p>
              </button>
            ))}
          </div>

          <div>
            {!current ? (
              <EmptyState icon={ArrowUpCircle} title="Select a request"
                description="Choose a request to see readiness and the decision trail." />
            ) : (
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">
                      {current.requested_level ? LEVEL_LABEL[current.requested_level] : 'Specialization request'}
                    </h2>
                    <p className="mt-1 text-xs text-ink-soft">
                      {staff ? `${current.student?.full_name} · ` : ''}
                      raised {formatDateTime(current.created_at)}
                    </p>
                  </div>
                  <Badge tone={TONE[current.status]}>{UPGRADE_STATUS_LABEL[current.status]}</Badge>
                </div>

                {current.reason && (
                  <p className="prose-lesson mt-4 rounded-xl bg-canvas px-4 py-3">{current.reason}</p>
                )}

                {current.specializations && (
                  <p className="mt-3 text-sm text-ink-muted">
                    Specialization requested: <strong>{current.specializations.name}</strong>
                  </p>
                )}

                {current.coach_reviewed_at && (
                  <div className="mt-4 rounded-xl border border-canvas-line px-4 py-3">
                    <p className="text-sm font-medium text-ink">
                      Coach {current.coach_recommended ? 'recommended' : 'did not recommend'}
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">{current.coach_notes || 'No notes.'}</p>
                    <p className="mt-1 text-[11px] text-ink-soft">{formatDate(current.coach_reviewed_at)}</p>
                  </div>
                )}

                {current.decided_at && (
                  <div className="mt-3 rounded-xl border border-canvas-line px-4 py-3">
                    <p className="text-sm font-medium text-ink">Decision</p>
                    <p className="mt-1 text-sm text-ink-muted">{current.decision_notes || 'No notes.'}</p>
                    <p className="mt-1 text-[11px] text-ink-soft">{formatDate(current.decided_at)}</p>
                  </div>
                )}

                {staff && (
                  <div className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-white p-2 text-brand-700 shadow-sm">
                        <LockKeyhole className="h-4 w-4" aria-hidden />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-ink">Private internal notes</h3>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          Visible only to coaches, managers, and owners. The student cannot see this conversation.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {internalNotes.loading ? <Spinner label="Loading internal notes" /> :
                        (internalNotes.data ?? []).length === 0 ? (
                          <p className="rounded-xl bg-white px-3 py-3 text-sm text-ink-muted">
                            No private notes yet. Use this area for payment checks, approval questions, or staff follow-up.
                          </p>
                        ) : (
                          (internalNotes.data ?? []).map((item) => (
                            <div key={item.id} className="rounded-xl border border-brand-100 bg-white px-4 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-ink">
                                  {item.author?.full_name ?? 'Staff member'}
                                  <span className="ml-2 text-xs font-normal capitalize text-ink-soft">{item.author?.role}</span>
                                </p>
                                <p className="text-[11px] text-ink-soft">{formatDateTime(item.created_at)}</p>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{item.body}</p>
                            </div>
                          ))
                        )}
                    </div>

                    <div className="mt-4">
                      <Textarea
                        label="Add a private note"
                        value={internalNote}
                        onChange={(e) => setInternalNote(e.target.value)}
                        placeholder="Example: Coach, did the student already pay the remaining balance?"
                      />
                      <div className="mt-3 flex justify-end">
                        <Button size="sm" loading={postingInternalNote} disabled={!internalNote.trim()} onClick={addInternalNote}>
                          <Send className="h-4 w-4" aria-hidden />Add internal note
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Decision trail */}
                <div className="mt-6">
                  <SectionHeading title="History" />
                  {trail.loading ? <Spinner label="Loading history" /> : (
                    (trail.data ?? []).length === 0
                      ? <p className="text-sm text-ink-muted">No actions recorded yet.</p>
                      : (
                        <ul className="space-y-2">
                          {(trail.data ?? []).map((t) => (
                            <li key={t.id} className="rounded-lg border border-canvas-line px-3 py-2">
                              <p className="text-sm text-ink">
                                <strong>{t.actor?.full_name ?? 'System'}</strong> — {t.action.replace(/_/g, ' ')}
                              </p>
                              {t.notes && <p className="mt-0.5 text-xs text-ink-muted">{t.notes}</p>}
                              <p className="mt-0.5 text-[11px] text-ink-soft">{formatDateTime(t.created_at)}</p>
                            </li>
                          ))}
                        </ul>
                      )
                  )}
                </div>

                {/* Staff actions */}
                {staff && !['approved', 'declined', 'cancelled'].includes(current.status) && (
                  <div className="mt-6 border-t border-canvas-line pt-4">
                    <Textarea label="Notes" value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder="Say what you checked and why. The student sees decision notes." />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!canDecide && (
                        <>
                          <Button size="sm" variant="secondary" loading={saving}
                            onClick={() => advance('recommended', 'recommend')}>
                            <ThumbsUp className="h-4 w-4" aria-hidden />Recommend
                          </Button>
                          <Button size="sm" variant="outline" loading={saving}
                            onClick={() => advance('more_information_required', 'not_recommended')}>
                            Needs more work
                          </Button>
                        </>
                      )}
                      {canDecide && (
                        <>
                          <Button size="sm" variant="outline" loading={saving}
                            onClick={() => advance('under_review', 'review')}>Mark under review</Button>
                          <Button size="sm" variant="outline" loading={saving}
                            onClick={() => advance('more_information_required', 'request_info')}>
                            Request more information
                          </Button>
                          <Button size="sm" loading={saving}
                            onClick={() => advance('approved', 'approve')}>
                            <CheckCircle2 className="h-4 w-4" aria-hidden />Approve and upgrade
                          </Button>
                          <Button size="sm" variant="ghost" loading={saving}
                            onClick={() => advance('declined', 'decline')}>
                            <XCircle className="h-4 w-4" aria-hidden />Decline
                          </Button>
                        </>
                      )}
                      {!canDecide && coachMayApprove && (
                        <Button size="sm" loading={saving}
                          onClick={() => advance('approved', 'approve')}>
                          Approve (enabled by Owner)
                        </Button>
                      )}
                    </div>
                    {!canDecide && !coachMayApprove && (
                      <p className="mt-2 text-xs text-ink-soft">
                        Coaches recommend; a Manager makes the final decision. The Owner can change this
                        in system settings.
                      </p>
                    )}
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      <Modal
        open={creating} onClose={() => setCreating(false)} wide
        title="Request an upgrade"
        description="Include the reason, payment status, amount and proof when applicable. Money-related approval follows the Owner's approval settings."
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={submitRequest} loading={saving}
              disabled={(!draft.level && !draft.spec) || (role === 'coach' && !draft.student_id) || !draft.reason.trim()}>Send request</Button>
          </>
        }
      >
        <div className="space-y-4">
          {role === 'coach' && <Select label="Student" required value={draft.student_id} onChange={(e) => setDraft({ ...draft, student_id: e.target.value })}><option value="">Choose student</option>{state.data!.students.map((s) => <option key={s.id} value={s.id}>{s.full_name} — {s.email}</option>)}</Select>}
          <Select label="Level you are asking for" value={draft.level}
            onChange={(e) => setDraft({ ...draft, level: e.target.value as LearningLevel })}>
            <option value="">No level change</option>
            <option value="level_2">Level 2 — Job-Ready Specialization</option>
            <option value="level_3">Level 3 — Advanced Skills</option>
          </Select>
          <Select label="Specialization" value={draft.spec}
            onChange={(e) => setDraft({ ...draft, spec: e.target.value })}
            hint="Optional — pick the track you want to focus on.">
            <option value="">No specialization</option>
            {state.data!.specializations.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          <Textarea label="Why you are ready" required value={draft.reason}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
            placeholder="What you have completed, and what you want to do next." />
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={draft.is_paid} onChange={(e) => setDraft({ ...draft, is_paid: e.target.checked })} />Payment has been made</label>
          <Input label="Amount paid" type="number" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="0.00" />
          <Input label="Proof of payment URL" type="url" value={draft.proof_url} onChange={(e) => setDraft({ ...draft, proof_url: e.target.value })} />
          <label className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-brand-300 bg-brand-50 text-sm font-medium text-brand-700">{uploadingProof ? 'Uploading proof...' : 'Upload proof image'}<input type="file" accept="image/*,.pdf" className="hidden" onChange={async(e)=>{const file=e.target.files?.[0];if(!file)return;setUploadingProof(true);try{const url=await uploadAcademyMedia(file,'payment-proofs');setDraft({...draft,proof_url:url});notify('Proof uploaded.')}catch(err){notify(readableError(err),'error')}finally{setUploadingProof(false)}}}/></label>
        </div>
      </Modal>
    </>
  )
}
