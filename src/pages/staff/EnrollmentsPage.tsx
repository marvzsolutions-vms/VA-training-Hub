import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAsyncData } from '../../lib/useAsyncData'
import { useToast } from '../../context/ToastContext'
import {
  Badge, Button, DataTable, EmptyState, ErrorState, Modal, PageHeader, Pagination,
  ProgressBar, SearchInput, Select, Spinner,
} from '../../components/ui'
import { formatDate, LEVEL_SHORT, readableError, STATUS_LABEL } from '../../lib/utils'
import type { AccessStatus, Course, Profile } from '../../lib/types'

interface EnrollmentRow {
  id: string
  student_id: string
  course_id: string
  status: AccessStatus
  progress: number
  enrolled_at: string
  student: Pick<Profile, 'id' | 'full_name' | 'email'> | null
  courses: Pick<Course, 'id' | 'title' | 'level'> | null
}

const PAGE_SIZE = 12

export default function EnrollmentsPage() {
  const { notify } = useToast()
  const [search, setSearch] = useState('')
  const [courseFilter, setCourseFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ student_id: '', course_id: '' })

  const state = useAsyncData<{
    rows: EnrollmentRow[]
    students: Array<Pick<Profile, 'id' | 'full_name' | 'email'>>
    courses: Course[]
  }>(async () => {
    const [rows, students, courses] = await Promise.all([
      supabase.from('course_enrollments')
        .select('id, student_id, course_id, status, progress, enrolled_at, student:profiles!course_enrollments_student_id_fkey(id, full_name, email), courses(id, title, level)')
        .order('enrolled_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email').eq('role', 'student').order('full_name'),
      supabase.from('courses').select('id, title, slug, level').order('level').order('sort_order'),
    ])
    if (rows.error) throw rows.error
    return {
      rows: (rows.data ?? []) as unknown as EnrollmentRow[],
      students: (students.data ?? []) as Array<Pick<Profile, 'id' | 'full_name' | 'email'>>,
      courses: (courses.data ?? []) as Course[],
    }
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (state.data?.rows ?? []).filter((row) => {
      if (courseFilter !== 'all' && row.course_id !== courseFilter) return false
      if (!term) return true
      return (row.student?.full_name ?? '').toLowerCase().includes(term) ||
        (row.courses?.title ?? '').toLowerCase().includes(term)
    })
  }, [state.data, search, courseFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const enroll = async () => {
    if (!form.student_id || !form.course_id) return
    setSaving(true)
    try {
      const { error } = await supabase.from('course_enrollments').insert({
        student_id: form.student_id,
        course_id: form.course_id,
        status: 'active',
      })
      if (error) throw error
      await supabase.from('notifications').insert({
        user_id: form.student_id,
        title: 'You were enrolled in a new course',
        body: 'Open your courses to get started.',
        link: '/courses',
      })
      notify('Student enrolled.')
      setAdding(false)
      setForm({ student_id: '', course_id: '' })
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const unenroll = async (id: string) => {
    try {
      const { error } = await supabase.from('course_enrollments').delete().eq('id', id)
      if (error) throw error
      notify('Enrolment removed.')
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    }
  }

  if (state.loading) return <Spinner label="Loading enrolments" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  return (
    <>
      <PageHeader
        title="Enrolments"
        description="Who is enrolled in what, and how far along they are."
        action={<Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden />Enrol a student
        </Button>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_260px]">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }}
          placeholder="Search by student or course" label="Search enrolments" />
        <Select value={courseFilter} onChange={(e) => { setCourseFilter(e.target.value); setPage(1) }}
          aria-label="Filter by course">
          <option value="all">All courses</option>
          {state.data!.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select>
      </div>

      <DataTable
        rows={visible}
        keyOf={(row) => row.id}
        empty={<EmptyState icon={ClipboardList} title="No enrolments match that filter"
          description="Enrol a student to give them a course to work through." />}
        columns={[
          {
            header: 'Student',
            cell: (row) => (
              <Link to={`/students/${row.student_id}`} className="rounded font-medium text-ink hover:text-brand-700">
                {row.student?.full_name ?? 'Unknown'}
              </Link>
            ),
          },
          { header: 'Course', cell: (row) => <span className="text-sm">{row.courses?.title}</span> },
          {
            header: 'Level',
            cell: (row) => row.courses ? <Badge tone="info">{LEVEL_SHORT[row.courses.level]}</Badge> : null,
          },
          {
            header: 'Status',
            cell: (row) => (
              <Badge tone={row.status === 'completed' ? 'success' : row.status === 'active' ? 'brand' : 'neutral'}>
                {STATUS_LABEL[row.status]}
              </Badge>
            ),
          },
          {
            header: 'Progress', className: 'w-40',
            cell: (row) => <ProgressBar value={Number(row.progress)} />,
          },
          {
            header: 'Enrolled',
            cell: (row) => <span className="text-xs">{formatDate(row.enrolled_at)}</span>,
          },
          {
            header: '',
            cell: (row) => <Button size="sm" variant="ghost" onClick={() => unenroll(row.id)}>Remove</Button>,
          },
        ]}
      />

      <Pagination page={current} pageCount={pageCount} onChange={setPage} />

      <Modal
        open={adding} onClose={() => setAdding(false)}
        title="Enrol a student"
        description="The student still needs the right level before locked content opens."
        footer={
          <>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button onClick={enroll} loading={saving}
              disabled={!form.student_id || !form.course_id}>Enrol student</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select label="Student" required value={form.student_id}
            onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
            <option value="">Choose a student</option>
            {state.data!.students.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name} — {s.email}</option>
            ))}
          </Select>
          <Select label="Course" required value={form.course_id}
            onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
            <option value="">Choose a course</option>
            {state.data!.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
        </div>
      </Modal>
    </>
  )
}
