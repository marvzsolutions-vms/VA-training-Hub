import { useMemo, useState } from 'react'
import { ExternalLink as LinkIcon, LogIn, Plus, UserPlus, Wrench } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAsyncData } from '../lib/useAsyncData'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { isStaff } from '../lib/access'
import {
  Badge, Button, Card, EmptyState, ErrorState, ExternalLink, Input, Modal, PageHeader,
  SearchInput, Select, Spinner, Textarea,
} from '../components/ui'
import { formatDate, LEVEL_SHORT, readableError } from '../lib/utils'
import type { LearningLevel, Tool } from '../lib/types'

interface Category { id: number; slug: string; name: string }

const EMPTY_TOOL = {
  id: '', name: '', slug: '', description: '', category_id: '', website_url: '', login_url: '',
  signup_url: '', pricing_label: 'Free', pricing_notes: '', recommended_use: '',
  level: 'level_1' as LearningLevel, internal_guide: '',
}
type ToolForm = typeof EMPTY_TOOL

export default function ToolsPage() {
  const { role } = useAuth()
  const { notify } = useToast()
  const staff = isStaff(role)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [editing, setEditing] = useState<ToolForm | null>(null)
  const [saving, setSaving] = useState(false)

  const state = useAsyncData<{ tools: Tool[]; categories: Category[] }>(async () => {
    const [tools, categories] = await Promise.all([
      supabase.from('tools').select('*, tool_categories(id, name, slug)').order('name'),
      supabase.from('tool_categories').select('*').order('sort_order'),
    ])
    if (tools.error) throw tools.error
    return {
      tools: (tools.data ?? []) as Tool[],
      categories: (categories.data ?? []) as Category[],
    }
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (state.data?.tools ?? []).filter((tool) => {
      if (category !== 'all' && String(tool.category_id) !== category) return false
      if (!term) return true
      return tool.name.toLowerCase().includes(term) || tool.description.toLowerCase().includes(term)
    })
  }, [state.data, search, category])

  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const payload = {
        name: editing.name.trim(),
        slug: editing.slug.trim() || editing.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: editing.description,
        category_id: editing.category_id ? Number(editing.category_id) : null,
        website_url: editing.website_url || null,
        login_url: editing.login_url || null,
        signup_url: editing.signup_url || null,
        pricing_label: editing.pricing_label,
        pricing_notes: editing.pricing_notes,
        recommended_use: editing.recommended_use,
        level: editing.level,
        internal_guide: editing.internal_guide,
        last_reviewed_at: new Date().toISOString().slice(0, 10),
        review_status: 'current' as const,
      }
      const { error } = editing.id
        ? await supabase.from('tools').update(payload).eq('id', editing.id)
        : await supabase.from('tools').insert(payload)
      if (error) throw error
      notify(editing.id ? 'Tool updated.' : 'Tool added.')
      setEditing(null)
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (state.loading) return <Spinner label="Loading tools" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  return (
    <>
      <PageHeader
        title="Tools directory"
        description="Every tool used across the academy, with the links you need to get started."
        action={staff && (
          <Button onClick={() => setEditing({ ...EMPTY_TOOL })}>
            <Plus className="h-4 w-4" aria-hidden />Add a tool
          </Button>
        )}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_220px]">
        <SearchInput value={search} onChange={setSearch} placeholder="Search tools" label="Search tools" />
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
          <option value="all">All categories</option>
          {state.data!.categories.map((c) => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Wrench} title="No tools match that filter"
          description="Try another category, or clear the search box."
          action={<Button variant="outline" onClick={() => { setSearch(''); setCategory('all') }}>Clear filters</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tool) => (
            <Card key={tool.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-ink">{tool.name}</h2>
                <Badge tone={tool.pricing_label === 'Free' ? 'success' : tool.pricing_label === 'Paid' ? 'warning' : 'info'}>
                  {tool.pricing_label}
                </Badge>
              </div>
              <p className="mt-1.5 flex-1 text-sm text-ink-muted">{tool.description}</p>

              {tool.recommended_use && (
                <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-muted">
                  Use it for: {tool.recommended_use}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                <Badge tone="neutral">{tool.tool_categories?.name ?? 'Uncategorised'}</Badge>
                <Badge tone="neutral">{LEVEL_SHORT[tool.level]}</Badge>
                {staff && tool.review_status !== 'current' && <Badge tone="warning">Needs review</Badge>}
              </div>

              <div className="mt-4 flex flex-wrap gap-3 border-t border-canvas-line pt-3 text-xs font-medium">
                {tool.website_url && (
                  <ExternalLink href={tool.website_url} className="flex items-center gap-1 text-brand-700 hover:underline">
                    <LinkIcon className="h-3.5 w-3.5" aria-hidden />Website
                  </ExternalLink>
                )}
                {tool.login_url && (
                  <ExternalLink href={tool.login_url} className="flex items-center gap-1 text-brand-700 hover:underline">
                    <LogIn className="h-3.5 w-3.5" aria-hidden />Log in
                  </ExternalLink>
                )}
                {tool.signup_url && (
                  <ExternalLink href={tool.signup_url} className="flex items-center gap-1 text-brand-700 hover:underline">
                    <UserPlus className="h-3.5 w-3.5" aria-hidden />Sign up
                  </ExternalLink>
                )}
              </div>

              {staff && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-ink-soft">
                    Reviewed {formatDate(tool.last_reviewed_at)}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setEditing({
                    id: tool.id, name: tool.name, slug: tool.slug, description: tool.description,
                    category_id: tool.category_id ? String(tool.category_id) : '',
                    website_url: tool.website_url ?? '', login_url: tool.login_url ?? '',
                    signup_url: tool.signup_url ?? '', pricing_label: tool.pricing_label,
                    pricing_notes: tool.pricing_notes, recommended_use: tool.recommended_use,
                    level: tool.level, internal_guide: tool.internal_guide,
                  })}>
                    Edit
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!editing} onClose={() => setEditing(null)} wide
        title={editing?.id ? 'Edit tool' : 'Add a tool'}
        description="Links open in a new tab for everyone in the academy."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={!editing?.name.trim()}>Save tool</Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Tool name" required value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <Select label="Category" value={editing.category_id}
              onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}>
              <option value="">Uncategorised</option>
              {state.data!.categories.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </Select>
            <div className="sm:col-span-2">
              <Textarea label="Description" value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <Input label="Website URL" type="url" value={editing.website_url}
              onChange={(e) => setEditing({ ...editing, website_url: e.target.value })} />
            <Input label="Login URL" type="url" value={editing.login_url}
              onChange={(e) => setEditing({ ...editing, login_url: e.target.value })} />
            <Input label="Sign-up URL" type="url" value={editing.signup_url}
              onChange={(e) => setEditing({ ...editing, signup_url: e.target.value })} />
            <Select label="Pricing" value={editing.pricing_label}
              onChange={(e) => setEditing({ ...editing, pricing_label: e.target.value })}>
              <option>Free</option><option>Freemium</option><option>Paid</option><option>Trial</option>
            </Select>
            <Select label="Learning level" value={editing.level}
              onChange={(e) => setEditing({ ...editing, level: e.target.value as LearningLevel })}>
              <option value="level_1">Level 1</option>
              <option value="level_2">Level 2</option>
              <option value="level_3">Level 3</option>
            </Select>
            <Input label="Recommended use" value={editing.recommended_use}
              onChange={(e) => setEditing({ ...editing, recommended_use: e.target.value })}
              hint="One line students will see on the card." />
            <div className="sm:col-span-2">
              <Textarea label="Internal guide" value={editing.internal_guide}
                onChange={(e) => setEditing({ ...editing, internal_guide: e.target.value })}
                hint="Notes for coaches. Students never see this." />
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
