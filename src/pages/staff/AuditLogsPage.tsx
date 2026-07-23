import { useMemo, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAsyncData } from '../../lib/useAsyncData'
import {
  Badge, DataTable, EmptyState, ErrorState, PageHeader, Pagination, SearchInput, Select, Spinner,
} from '../../components/ui'
import { formatDateTime, ROLE_LABEL } from '../../lib/utils'
import type { ActivityLog, AuditLog } from '../../lib/types'

const PAGE_SIZE = 20

export default function AuditLogsPage() {
  const [tab, setTab] = useState<'audit' | 'activity'>('audit')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const state = useAsyncData<{ audit: AuditLog[]; activity: ActivityLog[] }>(async () => {
    const [audit, activity] = await Promise.all([
      supabase.from('audit_logs')
        .select('*, actor:profiles!audit_logs_actor_id_fkey(full_name, role)')
        .order('created_at', { ascending: false }).limit(500),
      supabase.from('activity_logs')
        .select('*, user:profiles!activity_logs_user_id_fkey(full_name, role)')
        .order('created_at', { ascending: false }).limit(500),
    ])
    if (audit.error) throw audit.error
    return {
      audit: (audit.data ?? []) as AuditLog[],
      activity: (activity.data ?? []) as ActivityLog[],
    }
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (tab === 'audit') {
      return (state.data?.audit ?? []).filter((row) => !term ||
        row.action.toLowerCase().includes(term) ||
        row.table_name.toLowerCase().includes(term) ||
        (row.actor?.full_name ?? '').toLowerCase().includes(term))
    }
    return (state.data?.activity ?? []).filter((row) => !term ||
      row.action.toLowerCase().includes(term) ||
      row.entity.toLowerCase().includes(term) ||
      (row.user?.full_name ?? '').toLowerCase().includes(term))
  }, [state.data, search, tab])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  if (state.loading) return <Spinner label="Loading logs" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  return (
    <>
      <PageHeader
        title="Audit and activity"
        description="Who changed what, and when. Written by database triggers, not by the interface."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_200px]">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }}
          placeholder="Search by person, action or table" label="Search logs" />
        <Select value={tab} aria-label="Log type"
          onChange={(e) => { setTab(e.target.value as 'audit' | 'activity'); setPage(1) }}>
          <option value="audit">Audit log (data changes)</option>
          <option value="activity">Activity log (usage)</option>
        </Select>
      </div>

      {tab === 'audit' ? (
        <DataTable
          rows={visible as AuditLog[]}
          keyOf={(row) => row.id}
          empty={<EmptyState icon={ScrollText} title="No audit entries"
            description="Changes to protected tables will appear here." />}
          columns={[
            {
              header: 'When',
              cell: (row) => <span className="text-xs">{formatDateTime(row.created_at)}</span>,
            },
            {
              header: 'Who',
              cell: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {row.actor?.full_name ?? 'System'}
                  </p>
                  {row.actor?.role && (
                    <p className="text-xs text-ink-soft">{ROLE_LABEL[row.actor.role]}</p>
                  )}
                </div>
              ),
            },
            {
              header: 'Action',
              cell: (row) => (
                <Badge tone={row.action === 'DELETE' ? 'danger' : row.action === 'INSERT' ? 'success' : 'info'}>
                  {row.action}
                </Badge>
              ),
            },
            { header: 'Table', cell: (row) => <span className="text-xs">{row.table_name}</span> },
            {
              header: 'Record',
              cell: (row) => (
                <span className="font-mono text-[11px] text-ink-soft">
                  {row.record_id ? row.record_id.slice(0, 8) : '—'}
                </span>
              ),
            },
          ]}
        />
      ) : (
        <DataTable
          rows={visible as ActivityLog[]}
          keyOf={(row) => row.id}
          empty={<EmptyState icon={ScrollText} title="No activity yet"
            description="Sign-ins and lesson activity will appear here." />}
          columns={[
            {
              header: 'When',
              cell: (row) => <span className="text-xs">{formatDateTime(row.created_at)}</span>,
            },
            {
              header: 'Who',
              cell: (row) => (
                <span className="text-sm text-ink">{row.user?.full_name ?? 'Unknown'}</span>
              ),
            },
            { header: 'Action', cell: (row) => <Badge tone="neutral">{row.action}</Badge> },
            { header: 'Entity', cell: (row) => <span className="text-xs">{row.entity}</span> },
            { header: 'Detail', cell: (row) => <span className="text-xs">{row.detail}</span> },
          ]}
        />
      )}

      <Pagination page={current} pageCount={pageCount} onChange={setPage} />
    </>
  )
}
