import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Button, Card, ConfirmDialog, Input, PageHeader, SectionHeading } from '../components/ui'
import { readableError, ROLE_LABEL } from '../lib/utils'

const schema = z.object({
  password: z.string().min(8, 'Use at least 8 characters'),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { message: 'Both passwords must match', path: ['confirm'] })
type Values = z.infer<typeof schema>

export default function SettingsPage() {
  const { profile, student, updatePassword, signOut } = useAuth()
  const { notify } = useToast()
  const [signingOut, setSigningOut] = useState(false)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' },
  })

  const changePassword = async (values: Values) => {
    try {
      await updatePassword(values.password)
      reset()
      notify('Password updated.')
    } catch (error) {
      notify(readableError(error), 'error')
    }
  }

  if (!profile) return null

  return (
    <>
      <PageHeader title="Settings" description="Account security and session options." />

      <form onSubmit={handleSubmit(changePassword)} className="mb-8" noValidate>
        <SectionHeading title="Change your password"
          description="Use something you do not use anywhere else." />
        <Card>
          <div className="grid gap-4 sm:max-w-md">
            <Input label="New password" type="password" autoComplete="new-password" required
              error={errors.password?.message} {...register('password')} />
            <Input label="Confirm new password" type="password" autoComplete="new-password" required
              error={errors.confirm?.message} {...register('confirm')} />
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="submit" loading={isSubmitting}>Update password</Button>
          </div>
        </Card>
      </form>

      <SectionHeading title="Account" />
      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Email</dt><dd className="font-medium text-ink">{profile.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Role</dt>
            <dd className="font-medium text-ink">{ROLE_LABEL[profile.role]}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Time zone</dt><dd className="font-medium text-ink">{profile.time_zone}</dd>
          </div>
          {student && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Learning level</dt>
              <dd className="font-medium text-ink">{student.current_level.replace('_', ' ')}</dd>
            </div>
          )}
        </dl>
        <p className="mt-4 text-xs text-ink-soft">
          Your role and learning level are managed by the academy. Ask a Manager if either looks wrong.
        </p>
      </Card>

      <SectionHeading title="Sign out" />
      <Card>
        <p className="text-sm text-ink-muted">
          Signing out ends this session on this device only.
        </p>
        <div className="mt-4">
          <Button variant="outline" onClick={() => setSigningOut(true)}>Sign out</Button>
        </div>
      </Card>

      <p className="mt-8 text-xs text-ink-soft">
        <Link to="/privacy" className="rounded hover:text-brand-700 hover:underline">Privacy policy</Link>
        {' · '}
        <Link to="/terms" className="rounded hover:text-brand-700 hover:underline">Terms of use</Link>
      </p>

      <ConfirmDialog
        open={signingOut} onClose={() => setSigningOut(false)} onConfirm={signOut}
        title="Sign out of VA Success Academy?"
        message="You will need your password to sign back in."
        confirmLabel="Sign out"
      />
    </>
  )
}
