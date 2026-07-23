import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAsyncData } from '../../lib/useAsyncData'
import { useToast } from '../../context/ToastContext'
import {
  Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, SectionHeading,
  Select, Spinner, Textarea,
} from '../../components/ui'
import { formatDate, readableError } from '../../lib/utils'
import type { Batch, Profile } from '../../lib/types'

interface Membership {
  batch_id: string
  student_id: string
  student: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}

const EMPTY = { id: '', code: '', name: '', description: '', coach_id: '', start_date: '', end_date: '' }

export default function BatchesPage() {
  const { notify } = useToast()
  const [form, setForm] = useState<typeof EMPTY | null>(null)
  const [assigning, setAssigning] = useState<Batch | null>(null)
  const [studentId, setStudentId] = useState('')
  const [saving, setSaving] = useState(false)

  const state = useAsyncData<{
    batches: Batch[]
    members: Membership[]
    coaches: Array<Pick<Profile, 'id' | 'full_name'>>
    students: Array<Pick<Profile, 'id' | 'full_name' | 'email'>>
  }>(async () => {
    const [batches, members, coaches, students] = await Promise.all([
      supabase.from('batches')
        .select('*, coach:profiles!batches_coach_id_fkey(id, full_name, email)')
        .order('code'),
      supabase.from('batch_students')
        .select('batch_id, student_id, student:profiles!batch_students_student_id_fkey(id, full_name, email)'),
      supabase.from('profiles').select('id, full_name').in('role', ['coach', 'manager', 'owner']).order('full_name'),
      supabase.from('profiles').select('id, full_name, email').eq('role', 'student').order('full_name'),
    ])
    if (batches.error) throw batches.error
    return {
      batches: (batches.data ?? []) as Batch[],
      members: (members.data ?? []) as unknown as Membership[],
      coaches: (coaches.data ?? []) as Array<Pick<Profile, 'id' | 'full_name'>>,
      students: (students.data ?? []) as Array<Pick<Profile, 'id' | 'full_name' | 'email'>>,
    }
  }, [])

  const save = async () => {
    if (!form) return
    setSaving(true)
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description,
        coach_id: form.coach_id || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      }
      const { error } = form.id
        ? await supabase.from('batches').update(payload).eq('id', form.id)
        : await supabase.from('batches').insert(payload)
      if (error) throw error
      notify(form.id ? 'Batch updated.' : 'Batch created.')
      setForm(null)
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const addStudent = async () => {
    if (!assigning || !studentId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('batch_students')
        .insert({ batch_id: assigning.id, student_id: studentId })
      if (error) throw error
      notify('Student added to the batch.')
      setStudentId('')
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const removeStudent = async (batchId: string, id: string) => {
    try {
      const { error } = await supabase.from('batch_students')
        .delete().eq('batch_id', batchId).eq('student_id', id)
      if (error) throw error
      notify('Student removed from the batch.')
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    }
  }

  if (state.loading) return <Spinner label="Loading batches" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  const { batches, members } = state.data!
  const membersOf = (batchId: string) => members.filter((m) => m.batch_id === batchId)

  return (
    <>
      <PageHeader
        title="Batches"
        description="Group students into cohorts. Coaches only see students in the batches they run."
        action={<Button onClick={() => setForm({ ...EMPTY })}>
          <Plus className="h-4 w-4" aria-hidden />New batch
        </Button>}
      />

      {batches.length === 0 ? (
        <EmptyState icon={Users} title="No batches yet"
          description="Create a batch, then assign students and a coach."
          action={<Button onClick={() => setForm({ ...EMPTY })}>Create the first batch</Button>} />
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => {
            const roster = membersOf(batch.id)
            return (
              <Card key={batch.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-ink">{batch.name}</h2>
                      <Badge tone="brand">{batch.code}</Badge>
                      {!batch.is_active && <Badge tone="neutral">Inactive</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">{batch.description}</p>
                    <p className="mt-2 text-xs text-ink-soft">
                      Coach: {batch.coach?.full_name ?? 'Unassigned'} · {roster.length} student{roster.length === 1 ? '' : 's'}
                      {batch.start_date ? ` · starts ${formatDate(batch.start_date)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setForm({
                      id: batch.id, code: batch.code, name: batch.name, description: batch.description,
                      coach_id: batch.coach_id ?? '', start_date: batch.start_date ?? '',
                      end_date: batch.end_date ?? '',
                    })}>Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => setAssigning(batch)}>Manage roster</Button>
                  </div>
                </div>
                {roster.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-canvas-line pt-3">
                    {roster.map((member) => (
                      <Link key={member.student_id} to={`/students/${member.student_id}`}
                        className="rounded-full bg-canvas px-3 py-1 text-xs text-ink-muted hover:bg-brand-50 hover:text-brand-700">
                        {member.student?.full_name}
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={!!form} onClose={() => setForm(null)} wide
        title={form?.id ? 'Edit batch' : 'Create a batch'}
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={!form?.code.trim() || !form?.name.trim()}>
              Save batch
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Batch code" required value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              hint="For example VA-2026-A" />
            <Input label="Batch name" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="sm:col-span-2">
              <Textarea label="Description" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <Select label="Coach" value={form.coach_id}
              onChange={(e) => setForm({ ...form, coach_id: e.target.value })}>
              <option value="">Unassigned</option>
              {state.data!.coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
            <div />
            <Input label="Start date" type="date" value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            <Input label="End date" type="date" value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
        )}
      </Modal>

      <Modal
        open={!!assigning} onClose={() => setAssigning(null)} wide
        title={assigning ? `Roster — ${assigning.name}` : 'Roster'}
        footer={<Button variant="outline" onClick={() => setAssigning(null)}>Done</Button>}
      >
        {assigning && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <Select label="Add a student" value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}>
                  <option value="">Choose a student</option>
                  {state.data!.students
                    .filter((s) => !membersOf(assigning.id).some((m) => m.student_id === s.id))
                    .map((s) => <option key={s.id} value={s.id}>{s.full_name} — {s.email}</option>)}
                </Select>
              </div>
              <Button onClick={addStudent} loading={saving} disabled={!studentId}>Add</Button>
            </div>

            <div>
              <SectionHeading title="Current roster" />
              {membersOf(assigning.id).length === 0 ? (
                <p className="text-sm text-ink-muted">No students in this batch yet.</p>
              ) : (
                <ul className="divide-y divide-canvas-line rounded-xl border border-canvas-line">
                  {membersOf(assigning.id).map((member) => (
                    <li key={member.student_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{member.student?.full_name}</p>
                        <p className="truncate text-xs text-ink-soft">{member.student?.email}</p>
                      </div>
                      <Button size="sm" variant="ghost"
                        onClick={() => removeStudent(assigning.id, member.student_id)}>Remove</Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
