import { useEffect, useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { uploadAcademyMedia } from '../../lib/media'
import { useAsyncData } from '../../lib/useAsyncData'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  Button, Card, ErrorState, Input, PageHeader, SectionHeading, Select, Spinner, Textarea,
} from '../../components/ui'
import { initials, readableError } from '../../lib/utils'
import type { Branding } from '../../lib/types'

export default function BrandingPage() {
  const { refresh } = useAuth()
  const { notify } = useToast()
  const [draft, setDraft] = useState<Branding | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const state = useAsyncData<Branding>(async () => {
    const { data, error } = await supabase.from('branding_settings').select('*').eq('id', 1).maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Branding settings row is missing. Run migration 0004.')
    return data as Branding
  }, [])

  useEffect(() => {
    if (state.data) setDraft(state.data)
  }, [state.data])


  const uploadLogo = async (file?: File) => {
    if (!file || !draft) return
    setUploading(true)
    try {
      const url = await uploadAcademyMedia(file, 'branding')
      setDraft({ ...draft, logo_url: url })
      notify('Logo uploaded. Save branding to apply it.')
    } catch (error) {
      notify(readableError(error), 'error')
    } finally { setUploading(false) }
  }

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const { error } = await supabase.from('branding_settings').update({
        app_name: draft.app_name.trim(),
        tagline: draft.tagline,
        logo_url: draft.logo_url || null,
        primary_color: draft.primary_color,
        accent_color: draft.accent_color,
        support_email: draft.support_email,
        description: draft.description || '',
        website_url: draft.website_url || '',
        facebook_url: draft.facebook_url || '',
        instagram_url: draft.instagram_url || '',
        linkedin_url: draft.linkedin_url || '',
        youtube_url: draft.youtube_url || '',
        default_theme: draft.default_theme ?? 'light',
      }).eq('id', 1)
      if (error) throw error
      await refresh()
      notify('Branding saved. It updates everywhere immediately.')
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (state.loading || !draft) return <Spinner label="Loading branding" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  return (
    <>
      <PageHeader
        title="Branding"
        description="The academy name, tagline and colours. Nothing here is hard-coded in the app."
        action={<Button onClick={save} loading={saving}>Save branding</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeading title="Identity" />
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input label="Academy name" value={draft.app_name}
                  onChange={(e) => setDraft({ ...draft, app_name: e.target.value })}
                  hint="Shown in the sidebar, sign-in page and browser tab." />
              </div>
              <div className="sm:col-span-2">
                <Textarea label="Tagline" value={draft.tagline}
                  onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Input label="Logo URL" type="url" value={draft.logo_url ?? ''}
                  onChange={(e) => setDraft({ ...draft, logo_url: e.target.value })}
                  hint="Paste a public URL or upload a logo below." />
                <label className="mt-3 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50 text-sm font-medium text-brand-700">
                  <ImageIcon className="h-4 w-4" />{uploading ? 'Uploading logo...' : 'Upload logo image'}
                  <input className="hidden" type="file" accept="image/*" onChange={(e) => uploadLogo(e.target.files?.[0])} />
                </label>
              </div>
              <Input label="Support email" type="email" value={draft.support_email}
                onChange={(e) => setDraft({ ...draft, support_email: e.target.value })} />
              <div className="sm:col-span-2">
                <Textarea label="Academy description" value={draft.description ?? ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  hint="A short professional description shown on public pages and academy information areas." />
              </div>
              <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
                <Input label="Website link" type="url" value={draft.website_url ?? ''} onChange={(e) => setDraft({ ...draft, website_url: e.target.value })} />
                <Input label="Facebook link" type="url" value={draft.facebook_url ?? ''} onChange={(e) => setDraft({ ...draft, facebook_url: e.target.value })} />
                <Input label="Instagram link" type="url" value={draft.instagram_url ?? ''} onChange={(e) => setDraft({ ...draft, instagram_url: e.target.value })} />
                <Input label="LinkedIn link" type="url" value={draft.linkedin_url ?? ''} onChange={(e) => setDraft({ ...draft, linkedin_url: e.target.value })} />
                <Input label="YouTube link" type="url" value={draft.youtube_url ?? ''} onChange={(e) => setDraft({ ...draft, youtube_url: e.target.value })} />
              </div>
            </div>
          </Card>

          <div className="mt-6">
            <SectionHeading title="Default appearance" description="Choose the academy default. Every user can still select Light or Dark for their own account." />
            <Card>
              <Select label="Default theme" value={draft.default_theme ?? 'light'} onChange={(e) => setDraft({ ...draft, default_theme: e.target.value as 'light' | 'dark' })}>
                <option value="light">Light mode</option>
                <option value="dark">Dark mode</option>
              </Select>
              <p className="mt-3 text-xs text-ink-soft">This becomes the initial module background for users who have not selected a personal preference.</p>
            </Card>
          </div>

          <div className="mt-6">
            <SectionHeading title="Colours"
              description="Used for accents across the interface." />
            <Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="primary-color">Primary colour</label>
                  <div className="mt-1 flex items-center gap-3">
                    <input id="primary-color" type="color" value={draft.primary_color}
                      onChange={(e) => setDraft({ ...draft, primary_color: e.target.value })}
                      className="h-10 w-14 cursor-pointer rounded-lg border border-canvas-line bg-white p-1" />
                    <Input aria-label="Primary colour hex" value={draft.primary_color}
                      onChange={(e) => setDraft({ ...draft, primary_color: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="field-label" htmlFor="accent-color">Accent colour</label>
                  <div className="mt-1 flex items-center gap-3">
                    <input id="accent-color" type="color" value={draft.accent_color}
                      onChange={(e) => setDraft({ ...draft, accent_color: e.target.value })}
                      className="h-10 w-14 cursor-pointer rounded-lg border border-canvas-line bg-white p-1" />
                    <Input aria-label="Accent colour hex" value={draft.accent_color}
                      onChange={(e) => setDraft({ ...draft, accent_color: e.target.value })} />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <aside>
          <SectionHeading title="Preview" />
          <Card>
            <div className="flex items-center gap-3">
              {draft.logo_url ? (
                <img src={draft.logo_url} alt="" className="h-12 w-12 rounded-xl object-contain" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-white"
                  style={{ backgroundColor: draft.primary_color }}>
                  {initials(draft.app_name || 'VA')}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate font-display font-bold text-ink">{draft.app_name}</p>
                <p className="truncate text-xs text-ink-soft">{draft.tagline}</p>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <button type="button"
                className="w-full rounded-xl px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: draft.primary_color }}>
                Primary button
              </button>
              <button type="button"
                className="w-full rounded-xl px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: draft.accent_color }}>
                Accent button
              </button>
            </div>
            <p className="mt-4 text-xs text-ink-soft">
              Support: {draft.support_email}
            </p>
          </Card>
          <Button className="mt-4 w-full" onClick={save} loading={saving}>Save branding</Button>
        </aside>
      </div>
    </>
  )
}
