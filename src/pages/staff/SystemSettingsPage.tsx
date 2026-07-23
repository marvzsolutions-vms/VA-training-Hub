import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAsyncData } from '../../lib/useAsyncData'
import { useToast } from '../../context/ToastContext'
import {
  Button, Card, ErrorState, Input, PageHeader, SectionHeading, Spinner, Textarea,
} from '../../components/ui'
import { formatDateTime, readableError } from '../../lib/utils'

interface Setting {
  key: string
  value: string
  description: string
  category: string
  label: string
  value_type: 'text' | 'boolean' | 'number' | 'email' | 'url'
  updated_at: string
}

export default function SystemSettingsPage() {
  const { notify } = useToast()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const state = useAsyncData<Setting[]>(async () => {
    const { data, error } = await supabase.from('system_settings')
      .select('key, value, description, updated_at').order('key')
    if (error) throw error
    const meta: Record<string, Pick<Setting, 'category' | 'label' | 'value_type'>> = {
      enrollment_open: { category: 'Enrolment', label: 'Enrolment open', value_type: 'boolean' },
      default_time_zone: { category: 'Regional', label: 'Default time zone', value_type: 'text' },
      support_hours: { category: 'Support', label: 'Support hours', value_type: 'text' },
      level2_auto_eligibility: { category: 'Progression', label: 'Automatic Level 2 eligibility', value_type: 'boolean' },
      level3_requires_owner: { category: 'Progression', label: 'Level 3 requires Owner approval', value_type: 'boolean' },
      session_retention_days: { category: 'Sessions', label: 'Recording retention (days)', value_type: 'number' },
    }
    return ((data ?? []) as Array<Pick<Setting, 'key' | 'value' | 'description' | 'updated_at'>>).map((row) => ({
      ...row,
      category: meta[row.key]?.category ?? (row.key.startsWith('perm.') ? 'Permissions' : 'General'),
      label: meta[row.key]?.label ?? row.key.replace(/^perm\./, '').replace(/_/g, ' '),
      value_type: meta[row.key]?.value_type ?? (row.key.startsWith('perm.') ? 'boolean' : 'text'),
    })) as Setting[]
  }, [])

  useEffect(() => {
    if (state.data) {
      setDrafts(Object.fromEntries(state.data.map((s) => [s.key, s.value])))
    }
  }, [state.data])

  const save = async (key: string) => {
    setSaving(key)
    try {
      const { error } = await supabase.from('system_settings')
        .update({ value: drafts[key] }).eq('key', key)
      if (error) throw error
      notify('Setting saved.')
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(null)
    }
  }

  if (state.loading) return <Spinner label="Loading settings" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  const rows = state.data ?? []
  const categories = Array.from(new Set(rows.map((s) => s.category)))

  return (
    <>
      <PageHeader
        title="System settings"
        description="Academy-wide defaults. Changes are written to the audit log."
      />

      {categories.map((category) => (
        <div key={category} className="mb-8">
          <SectionHeading title={category} />
          <div className="space-y-4">
            {rows.filter((s) => s.category === category).map((setting) => {
              const isLong = setting.value.length > 60
              const changed = drafts[setting.key] !== setting.value
              return (
                <Card key={setting.key}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-[220px] flex-1">
                      <p className="font-medium text-ink">{setting.label || setting.key}</p>
                      <p className="mt-0.5 text-sm text-ink-muted">{setting.description}</p>
                      <p className="mt-1 text-[11px] text-ink-soft">
                        Updated {formatDateTime(setting.updated_at)}
                      </p>
                    </div>
                    <div className="min-w-[260px] flex-1">
                      {setting.value_type === 'boolean' ? (
                        <label className="flex items-center gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            checked={['true','t','1','yes'].includes((drafts[setting.key] ?? '').toLowerCase())}
                            onChange={(e) => setDrafts({
                              ...drafts, [setting.key]: e.target.checked ? 'true' : 'false',
                            })}
                            className="h-4 w-4 rounded border-canvas-line text-brand-600"
                          />
                          {['true','t','1','yes'].includes((drafts[setting.key] ?? '').toLowerCase())
                            ? 'Enabled' : 'Disabled'}
                        </label>
                      ) : isLong ? (
                        <Textarea aria-label={setting.key} rows={3} value={drafts[setting.key] ?? ''}
                          onChange={(e) => setDrafts({ ...drafts, [setting.key]: e.target.value })} />
                      ) : (
                        <Input aria-label={setting.key} value={drafts[setting.key] ?? ''}
                          onChange={(e) => setDrafts({ ...drafts, [setting.key]: e.target.value })} />
                      )}
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" disabled={!changed} loading={saving === setting.key}
                          onClick={() => save(setting.key)}>
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}
