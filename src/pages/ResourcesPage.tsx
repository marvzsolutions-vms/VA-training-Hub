import { useState } from 'react'
import { ExternalLink, FolderOpen, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAsyncData } from '../lib/useAsyncData'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { isStaff } from '../lib/access'
import { ownerDeleteRecord } from '../lib/ownerDelete'
import { Button, Card, ConfirmDialog, ErrorState, Input, Modal, PageHeader, Spinner, Textarea } from '../components/ui'
import { readableError } from '../lib/utils'

interface ResourceSlot {
  id: number
  slot_number: number
  title: string
  description: string
  button_label: string
  google_url: string
  is_active: boolean
}

const blankSlot = (slot: number): ResourceSlot => ({
  id: 0,
  slot_number: slot,
  title: '',
  description: '',
  button_label: 'Open resource',
  google_url: '',
  is_active: true,
})

export default function ResourcesPage() {
  const { role } = useAuth()
  const { notify } = useToast()
  const staff = isStaff(role)
  const [editing, setEditing] = useState<ResourceSlot | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ResourceSlot | null>(null)

  const state = useAsyncData<ResourceSlot[]>(async () => {
    const { data, error } = await supabase.from('resource_slots')
      .select('*').order('slot_number')
    if (error) throw error
    const rows = (data ?? []) as ResourceSlot[]
    return staff
      ? rows
      : rows.filter((row) => row.is_active && Boolean(row.title.trim() || row.description.trim() || row.google_url.trim()))
  }, [staff])

  const addResource = () => {
    const nextSlot = Math.max(0, ...(state.data ?? []).map((row) => row.slot_number)) + 1
    setEditing(blankSlot(nextSlot))
  }

  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const payload = {
        slot_number: editing.slot_number,
        title: editing.title.trim(),
        description: editing.description.trim(),
        button_label: editing.button_label.trim() || 'Open resource',
        google_url: editing.google_url.trim(),
        is_active: editing.is_active,
      }
      const { error } = await supabase.from('resource_slots')
        .upsert(payload, { onConflict: 'slot_number' })
      if (error) throw error
      notify(editing.id === 0 ? 'New resource added.' : `Resource ${editing.slot_number} saved.`)
      setEditing(null)
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }


  const remove = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try { await ownerDeleteRecord('resource', String(deleteTarget.id)); notify('Resource deleted.'); setDeleteTarget(null); setEditing(null); state.reload() }
    catch (error) { notify(readableError(error), 'error') } finally { setSaving(false) }
  }

  if (state.loading) return <Spinner label="Loading resources" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  return (
    <>
      <PageHeader
        title="Resource library"
        description={staff
          ? 'Add as many resource links as needed. Each resource can include a title, description, button label, and Google link.'
          : 'Open templates, tutorials, guides, and other learning resources shared by the academy.'}
        action={staff ? (
          <Button onClick={addResource}>
            <Plus className="h-4 w-4" aria-hidden />Add resource
          </Button>
        ) : undefined}
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {(state.data ?? []).map((slot) => {
          const hasContent = Boolean(slot.title.trim() || slot.description.trim() || slot.google_url.trim())
          return (
            <Card key={slot.slot_number} className="relative flex min-h-[245px] flex-col overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 to-brand-700" />
              <div className="flex items-start justify-between gap-3 pt-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <FolderOpen className="h-5 w-5" aria-hidden />
                </div>
                {staff && (
                  <div className="flex gap-1">{role==='owner'&&slot.id>0&&<Button variant="danger" size="sm" aria-label={`Delete resource ${slot.slot_number}`} onClick={()=>setDeleteTarget(slot)}><Trash2 className="h-3.5 w-3.5"/></Button>}<Button variant="ghost" size="sm" onClick={() => setEditing({ ...slot })}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden />Edit
                  </Button></div>
                )}
              </div>

              <div className="mt-5 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">
                  Resource {slot.slot_number}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-ink">
                  {slot.title.trim() || (staff ? 'Blank resource box' : 'Resource coming soon')}
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  {slot.description.trim() || (staff
                    ? 'Add the resource title, what students will find inside, and its Google link.'
                    : 'The academy owner will add a learning resource here.')}
                </p>
              </div>

              <div className="mt-5 border-t border-canvas-line pt-4">
                {slot.google_url.trim() ? (
                  <a href={slot.google_url} target="_blank" rel="noreferrer" className="block">
                    <Button className="w-full">
                      {slot.button_label || 'Open resource'}
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </Button>
                  </a>
                ) : (
                  <Button className="w-full" variant="outline" disabled>
                    {hasContent ? 'Google link not added yet' : 'Coming soon'}
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <ConfirmDialog open={!!deleteTarget} onClose={()=>setDeleteTarget(null)} onConfirm={remove} loading={saving} tone="danger" confirmLabel="Delete permanently" title="Delete resource?" message="This permanently removes the resource link. This cannot be undone."/>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing && !(state.data ?? []).some((row) => row.slot_number === editing.slot_number)
          ? 'Add new resource'
          : `Edit resource ${editing?.slot_number ?? ''}`}
        description="Paste a Google Drive, Google Docs, Google Sheets, Google Slides, or other Google link. It opens in a new tab for both students and staff."
        footer={(
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>
              <Save className="h-4 w-4" aria-hidden />Save resource
            </Button>
          </>
        )}
      >
        {editing && (
          <div className="space-y-4">
            <Input label="Title" value={editing.title}
              placeholder="Example: Client Onboarding Templates"
              onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <Textarea label="What is inside" rows={4} value={editing.description}
              placeholder="Describe the templates, guide, tutorial, or files students will receive."
              onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            <Input label="Button text" value={editing.button_label}
              placeholder="Open resource"
              onChange={(e) => setEditing({ ...editing, button_label: e.target.value })} />
            <Input label="Google link" type="url" value={editing.google_url}
              placeholder="https://drive.google.com/..."
              hint="Make sure the Google file or folder sharing permission allows your students to open it."
              onChange={(e) => setEditing({ ...editing, google_url: e.target.value })} />
          </div>
        )}
      </Modal>
    </>
  )
}
