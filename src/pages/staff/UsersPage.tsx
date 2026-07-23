import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus, Users } from 'lucide-react'
import { createSignupClient, supabase } from '../../lib/supabase'
import { useAsyncData } from '../../lib/useAsyncData'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  Badge, Button, ConfirmDialog, DataTable, EmptyState, ErrorState, Input, Modal, PageHeader,
  SearchInput, Select, Spinner,
} from '../../components/ui'
import { formatDate, readableError, ROLE_LABEL } from '../../lib/utils'
import type { AppRole, Profile } from '../../lib/types'

type PaymentStatus = 'unpaid' | 'half_paid' | 'paid'
interface UserRow extends Profile {
  student_profiles?: { payment_status: PaymentStatus; amount_paid: number; total_amount: number } | null
}

export default function UsersPage() {
  const { profile: me } = useAuth()
  const { notify } = useToast()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [inviting, setInviting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deactivating, setDeactivating] = useState<Profile | null>(null)
  const [paymentUser, setPaymentUser] = useState<UserRow | null>(null)
  const [paymentForm, setPaymentForm] = useState({ status: 'unpaid' as PaymentStatus, amountPaid: '0', totalAmount: '0' })
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', role: 'student' as AppRole,
  })

  const state = useAsyncData<UserRow[]>(async () => {
    const { data, error } = await supabase.from('profiles')
      .select('*, student_profiles!student_profiles_user_id_fkey(payment_status, amount_paid, total_amount)')
      .order('role').order('full_name')
    if (error) throw error
    return (data ?? []) as UserRow[]
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (state.data ?? []).filter((row) => {
      if (roleFilter !== 'all' && row.role !== roleFilter) return false
      if (!term) return true
      return row.full_name.toLowerCase().includes(term) || row.email.toLowerCase().includes(term)
    })
  }, [state.data, search, roleFilter])

  const createAccount = async () => {
    setSaving(true)
    try {
      // A throwaway client keeps the Owner signed in while the new auth user is created.
      const signupClient = createSignupClient()
      const { error } = await signupClient.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { data: { full_name: form.full_name.trim(), role: form.role } },
      })
      if (error) throw error
      notify('Account created. Ask them to sign in and change the password.')
      setInviting(false)
      setForm({ full_name: '', email: '', password: '', role: 'student' })
      setTimeout(() => state.reload(), 800)
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const changeRole = async (user: Profile, role: AppRole) => {
    try {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', user.id)
      if (error) throw error
      notify(`${user.full_name} is now a ${ROLE_LABEL[role]}.`)
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    }
  }

  const toggleActive = async () => {
    if (!deactivating) return
    try {
      const { error } = await supabase.from('profiles')
        .update({ is_active: !deactivating.is_active }).eq('id', deactivating.id)
      if (error) throw error
      notify(deactivating.is_active ? 'Account deactivated.' : 'Account reactivated.')
      setDeactivating(null)
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    }
  }


  const openPayment = (user: UserRow) => {
    const payment = user.student_profiles
    setPaymentUser(user)
    setPaymentForm({
      status: payment?.payment_status ?? 'unpaid',
      amountPaid: String(payment?.amount_paid ?? 0),
      totalAmount: String(payment?.total_amount ?? 0),
    })
  }

  const savePayment = async () => {
    if (!paymentUser) return
    setSaving(true)
    try {
      const amountPaid = Number(paymentForm.amountPaid || 0)
      const totalAmount = Number(paymentForm.totalAmount || 0)
      const { error } = await supabase.from('student_profiles').update({
        payment_status: paymentForm.status,
        amount_paid: Number.isFinite(amountPaid) ? amountPaid : 0,
        total_amount: Number.isFinite(totalAmount) ? totalAmount : 0,
      }).eq('user_id', paymentUser.id)
      if (error) throw error
      notify('Student payment details saved.')
      setPaymentUser(null)
      state.reload()
    } catch (error) {
      notify(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (state.loading) return <Spinner label="Loading users" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  return (
    <>
      <PageHeader
        title="Users"
        description="Every account in the academy. Only an Owner can change roles."
        action={<Button onClick={() => setInviting(true)}>
          <UserPlus className="h-4 w-4" aria-hidden />Create an account
        </Button>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_200px]">
        <SearchInput value={search} onChange={setSearch}
          placeholder="Search by name or email" label="Search users" />
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
          <option value="all">All roles</option>
          {Object.entries(ROLE_LABEL).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </Select>
      </div>

      <DataTable
        rows={filtered}
        keyOf={(row) => row.id}
        empty={<EmptyState icon={Users} title="No users match that filter"
          description="Try a different role or clear the search box." />}
        columns={[
          {
            header: 'Name',
            cell: (row) => (
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">
                  {row.full_name}
                  {row.id === me?.id && <span className="ml-2 text-xs font-normal text-ink-soft">(you)</span>}
                </p>
                <p className="truncate text-xs text-ink-soft">{row.email}</p>
              </div>
            ),
          },
          {
            header: 'Role',
            cell: (row) => (
              row.role === 'owner' || row.id === me?.id ? (
                <Badge tone={row.role === 'owner' ? 'brand' : 'neutral'}>{ROLE_LABEL[row.role]}</Badge>
              ) : (
                <Select value={row.role} aria-label={`Role for ${row.full_name}`} className="w-36"
                  onChange={(e) => changeRole(row, e.target.value as AppRole)}>
                  <option value="student">Student</option>
                  <option value="coach">Coach</option>
                  <option value="manager">Manager</option>
                  <option value="owner">Owner</option>
                </Select>
              )
            ),
          },
          {
            header: 'Status',
            cell: (row) => (
              <Badge tone={row.is_active ? 'success' : 'danger'}>
                {row.is_active ? 'Active' : 'Deactivated'}
              </Badge>
            ),
          },
          {
            header: 'Payment',
            cell: (row) => row.role === 'student' ? (
              <button type="button" onClick={() => openPayment(row)} className="text-left">
                <Badge tone={row.student_profiles?.payment_status === 'paid' ? 'success'
                  : row.student_profiles?.payment_status === 'half_paid' ? 'warning' : 'danger'}>
                  {(row.student_profiles?.payment_status ?? 'unpaid').replace('_', ' ')}
                </Badge>
                <p className="mt-1 text-xs text-ink-soft">
                  ₱{Number(row.student_profiles?.amount_paid ?? 0).toLocaleString()} / ₱{Number(row.student_profiles?.total_amount ?? 0).toLocaleString()}
                </p>
              </button>
            ) : <span className="text-xs text-ink-soft">—</span>,
          },
          { header: 'Joined', cell: (row) => <span className="text-xs">{formatDate(row.created_at)}</span> },
          {
            header: '',
            cell: (row) => (
              <div className="flex gap-1">
                {row.role === 'student' && (
                  <>
                    <Link to={`/students/${row.id}`}><Button size="sm" variant="ghost">Open</Button></Link>
                    <Button size="sm" variant="ghost" onClick={() => openPayment(row)}>Payment</Button>
                  </>
                )}
                {row.id !== me?.id && row.role !== 'owner' && (
                  <Button size="sm" variant="ghost" onClick={() => setDeactivating(row)}>
                    {row.is_active ? 'Deactivate' : 'Reactivate'}
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />

      <p className="mt-4 text-xs text-ink-soft">
        Owner accounts are protected in the database: a Manager cannot change or remove them, whatever the interface allows.
      </p>

      <Modal
        open={inviting} onClose={() => setInviting(false)}
        title="Create an account"
        description="The person can change this password from Settings once they sign in."
        footer={
          <>
            <Button variant="outline" onClick={() => setInviting(false)}>Cancel</Button>
            <Button onClick={createAccount} loading={saving}
              disabled={!form.email.trim() || form.password.length < 8 || !form.full_name.trim()}>
              Create account
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Full name" required value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input label="Email address" type="email" required value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Temporary password" type="password" required value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            hint="At least 8 characters. Share it privately, and ask them to change it." />
          <Select label="Role" value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as AppRole })}>
            <option value="student">Student</option>
            <option value="coach">Coach</option>
            <option value="manager">Manager</option>
            <option value="owner">Owner</option>
          </Select>
          <p className="text-xs text-ink-soft">
            If your Supabase project requires email confirmation, the person must confirm the address
            before their first sign-in.
          </p>
        </div>
      </Modal>

      <Modal
        open={!!paymentUser} onClose={() => setPaymentUser(null)}
        title={`Payment details${paymentUser ? ` — ${paymentUser.full_name}` : ''}`}
        description="Track whether the student is unpaid, partially paid, or fully paid and record the amount received."
        footer={
          <>
            <Button variant="outline" onClick={() => setPaymentUser(null)}>Cancel</Button>
            <Button onClick={savePayment} loading={saving}>Save payment</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select label="Payment status" value={paymentForm.status}
            onChange={(e) => setPaymentForm({ ...paymentForm, status: e.target.value as PaymentStatus })}>
            <option value="unpaid">Unpaid</option>
            <option value="half_paid">Half paid</option>
            <option value="paid">Paid</option>
          </Select>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Amount paid (PHP)" type="number" min="0" step="0.01"
              value={paymentForm.amountPaid}
              onChange={(e) => setPaymentForm({ ...paymentForm, amountPaid: e.target.value })} />
            <Input label="Total amount due (PHP)" type="number" min="0" step="0.01"
              value={paymentForm.totalAmount}
              onChange={(e) => setPaymentForm({ ...paymentForm, totalAmount: e.target.value })} />
          </div>
          <div className="rounded-lg bg-canvas px-3 py-2 text-sm text-ink-muted">
            Remaining balance: ₱{Math.max(0, Number(paymentForm.totalAmount || 0) - Number(paymentForm.amountPaid || 0)).toLocaleString()}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deactivating} onClose={() => setDeactivating(null)} onConfirm={toggleActive}
        title={deactivating?.is_active ? 'Deactivate this account?' : 'Reactivate this account?'}
        message={deactivating?.is_active
          ? 'They will be signed out of protected pages and lose access to all course content until reactivated.'
          : 'They will be able to sign in and reach their courses again.'}
        confirmLabel={deactivating?.is_active ? 'Deactivate' : 'Reactivate'}
      />
    </>
  )
}
