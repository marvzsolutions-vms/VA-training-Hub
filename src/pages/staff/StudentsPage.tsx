import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useAsyncData } from '../../lib/useAsyncData'
import {
  Badge, Button, DataTable, EmptyState, ErrorState, PageHeader, Pagination, ProgressBar,
  SearchInput, Select, Spinner,
} from '../../components/ui'
import { LEVEL_SHORT, relativeDays, STATUS_LABEL } from '../../lib/utils'
import type { AccessStatus, LearningLevel, Profile } from '../../lib/types'

interface StudentRow {
  user_id: string
  current_level: LearningLevel
  access_status: AccessStatus
  level_progress: number
  last_activity_at: string | null
  referred_by_coach: string | null
  profiles: Pick<Profile, 'id' | 'full_name' | 'email' | 'city'> | null
  referrer: Pick<Profile, 'id' | 'full_name'> | null
}

const PAGE_SIZE = 12

export default function StudentsPage() {
  const { profile: me, role } = useAuth()
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('all')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)

  const state = useAsyncData<StudentRow[]>(async () => {
    const { data, error } = await supabase.from('student_profiles')
      .select('user_id, current_level, access_status, level_progress, last_activity_at, referred_by_coach, profiles!student_profiles_user_id_fkey!inner(id, full_name, email, city), referrer:profiles!student_profiles_referred_by_coach_fkey(id, full_name)')
      .order('current_level')
    if (error) throw error
    return (data ?? []) as unknown as StudentRow[]
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (state.data ?? []).filter((row) => {
      if (level !== 'all' && row.current_level !== level) return false
      if (status !== 'all' && row.access_status !== status) return false
      if (!term) return true
      return (row.profiles?.full_name ?? '').toLowerCase().includes(term) ||
        (row.profiles?.email ?? '').toLowerCase().includes(term)
    })
  }, [state.data, search, level, status])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  if (state.loading) return <Spinner label="Loading students" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  return (
    <>
      <PageHeader title="Students"
        description={`${filtered.length} student${filtered.length === 1 ? '' : 's'} in view.`} />

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_160px_180px]">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }}
          placeholder="Search by name or email" label="Search students" />
        <Select value={level} onChange={(e) => { setLevel(e.target.value); setPage(1) }} aria-label="Filter by level">
          <option value="all">All levels</option>
          <option value="level_1">Level 1</option>
          <option value="level_2">Level 2</option>
          <option value="level_3">Level 3</option>
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </Select>
      </div>

      <DataTable
        rows={visible}
        keyOf={(row) => row.user_id}
        empty={<EmptyState icon={GraduationCap} title="No students match that filter"
          description="Try clearing the search box or choosing another level."
          action={<Button variant="outline" onClick={() => { setSearch(''); setLevel('all'); setStatus('all') }}>
            Clear filters</Button>} />}
        columns={[
          {
            header: 'Student',
            cell: (row) => (
              <Link to={`/students/${row.user_id}`} className="rounded font-medium text-ink hover:text-brand-700">
                {row.profiles?.full_name}
                <span className="block text-xs font-normal text-ink-soft">{row.profiles?.email}</span>
              </Link>
            ),
          },
          {
            header: 'Referral',
            cell: (row) => role === 'coach'
              ? (row.referred_by_coach === me?.id ? <Badge tone="brand">My referral</Badge> : <span className="text-xs text-ink-soft">Standard student</span>)
              : (row.referrer?.full_name ? <Badge tone="info">{row.referrer.full_name}</Badge> : <span className="text-xs text-ink-soft">Not assigned</span>),
          },
          { header: 'Level', cell: (row) => <Badge tone="info">{LEVEL_SHORT[row.current_level]}</Badge> },
          {
            header: 'Status',
            cell: (row) => (
              <Badge tone={row.access_status === 'active' ? 'success'
                : ['suspended', 'expired', 'locked'].includes(row.access_status) ? 'danger' : 'warning'}>
                {STATUS_LABEL[row.access_status]}
              </Badge>
            ),
          },
          {
            header: 'Level progress',
            className: 'w-40',
            cell: (row) => <ProgressBar value={Number(row.level_progress)} />,
          },
          {
            header: 'Last active',
            cell: (row) => <span className="text-xs">{relativeDays(row.last_activity_at)}</span>,
          },
          {
            header: '',
            cell: (row) => (
              <Link to={`/students/${row.user_id}`}>
                <Button size="sm" variant="ghost">Open</Button>
              </Link>
            ),
          },
        ]}
      />

      <Pagination page={current} pageCount={pageCount} onChange={setPage} />
    </>
  )
}
