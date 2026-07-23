import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAsyncData } from '../../lib/useAsyncData'
import { useToast } from '../../context/ToastContext'
import { Badge, Card, ErrorState, PageHeader, SectionHeading, Spinner } from '../../components/ui'
import { readableError, ROLE_LABEL } from '../../lib/utils'
import type { AppRole } from '../../lib/types'

interface Permission { id: number; code: string; name: string; description: string; category: string }
interface RoleRow { id: number; code: AppRole; name: string; rank: number }
interface RolePermission { role_id: number; permission_id: number; granted: boolean }

const ROLES: AppRole[] = ['student', 'coach', 'manager', 'owner']

export default function RolesPage() {
  const { notify } = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const state = useAsyncData<{
    permissions: Permission[]; matrix: RolePermission[]; roles: RoleRow[]
  }>(async () => {
    const [permissions, matrix, roles] = await Promise.all([
      supabase.from('permissions').select('*').order('category').order('id'),
      // role_permissions stores role_id, not a role code.
      supabase.from('role_permissions').select('role_id, permission_id, granted'),
      supabase.from('roles').select('id, code, name, rank').order('rank'),
    ])
    if (permissions.error) throw permissions.error
    if (roles.error) throw roles.error
    return {
      permissions: (permissions.data ?? []) as Permission[],
      matrix: (matrix.data ?? []) as RolePermission[],
      roles: (roles.data ?? []) as RoleRow[],
    }
  }, [])

  const roleId = (role: AppRole) =>
    (state.data?.roles ?? []).find((r) => r.code === role)?.id ?? null

  const has = (role: AppRole, permissionId: number) => {
    const rid = roleId(role)
    return rid !== null && (state.data?.matrix ?? []).some(
      (m) => m.role_id === rid && m.permission_id === permissionId && m.granted !== false)
  }

  const toggle = async (role: AppRole, permissionId: number) => {
    if (role === 'owner') {
      notify('Owner permissions cannot be reduced.', 'error')
      return
    }
    const rid = roleId(role)
    if (rid === null) { notify('That role no longer exists.', 'error'); return }
    const key = `${role}-${permissionId}`
    setBusy(key)
    try {
      const { error } = has(role, permissionId)
        ? await supabase.from('role_permissions').delete()
            .eq('role_id', rid).eq('permission_id', permissionId)
        : await supabase.from('role_permissions')
            .upsert({ role_id: rid, permission_id: permissionId, granted: true },
                    { onConflict: 'role_id,permission_id' })
      if (error) throw error
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  if (state.loading) return <Spinner label="Loading permissions" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  const categories = Array.from(new Set(state.data!.permissions.map((p) => p.category)))

  return (
    <>
      <PageHeader
        title="Roles and permissions"
        description="What each role can do. The database enforces these rules again on every request."
      />

      <Card className="mb-6 border-brand-200 bg-brand-50/60">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
          <div className="text-sm text-brand-900">
            <p className="font-semibold">Owner permissions are fixed</p>
            <p className="mt-1 text-brand-900/80">
              An Owner always keeps full control, and Managers cannot modify or delete an Owner account.
              That rule lives in Postgres, so it holds even if someone calls the API directly.
            </p>
          </div>
        </div>
      </Card>

      {categories.map((category) => (
        <div key={category} className="mb-8">
          <SectionHeading title={category} />
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead>
                  <tr className="border-b border-canvas-line bg-canvas/60">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                      Permission
                    </th>
                    {ROLES.map((role) => (
                      <th key={role}
                        className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-ink-soft">
                        {ROLE_LABEL[role]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.data!.permissions.filter((p) => p.category === category).map((permission) => (
                    <tr key={permission.id} className="border-b border-canvas-line/70 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{permission.name}</p>
                        <p className="text-xs text-ink-soft">{permission.description}</p>
                      </td>
                      {ROLES.map((role) => {
                        const enabled = has(role, permission.id)
                        const locked = role === 'owner'
                        return (
                          <td key={role} className="px-4 py-3 text-center">
                            <label className="inline-flex items-center justify-center">
                              <span className="sr-only">
                                {permission.name} for {ROLE_LABEL[role]}
                              </span>
                              <input
                                type="checkbox"
                                checked={enabled}
                                disabled={locked || busy === `${role}-${permission.id}`}
                                onChange={() => toggle(role, permission.id)}
                                className="h-4 w-4 rounded border-canvas-line text-brand-600 disabled:opacity-50"
                              />
                            </label>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((role) => (
          <Card key={role}>
            <Badge tone={role === 'owner' ? 'brand' : 'neutral'}>{ROLE_LABEL[role]}</Badge>
            <p className="mt-2 text-sm text-ink-muted">
              {role === 'student' && 'Sees only their own progress, and only content their level allows.'}
              {role === 'coach' && 'Teaches and answers questions for students in their own batches.'}
              {role === 'manager' && 'Runs the academy day to day: access, batches, enrolments and content.'}
              {role === 'owner' && 'Full control, including roles, branding, system settings and audit logs.'}
            </p>
          </Card>
        ))}
      </div>
    </>
  )
}
