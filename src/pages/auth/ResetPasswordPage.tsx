import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import AuthLayout from './AuthLayout'
import { Button, Input, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { supabase } from '../../lib/supabase'
import { readableError } from '../../lib/utils'

const schema = z.object({
  password: z.string().min(8, 'Use at least 8 characters'),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, {
  message: 'Both passwords must match', path: ['confirm'],
})
type FormValues = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const { updatePassword } = useAuth()
  const { notify } = useToast()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' },
  })

  // Supabase puts the recovery session in the URL; detectSessionInUrl consumes it.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session)
      setChecking(false)
    })
  }, [])

  const onSubmit = async (values: FormValues) => {
    setFormError(null)
    try {
      await updatePassword(values.password)
      notify('Password updated. You are signed in.')
      navigate('/dashboard', { replace: true })
    } catch (error) {
      setFormError(readableError(error))
    }
  }

  return (
    <AuthLayout title="Set a new password" description="Choose a password you have not used before.">
      {checking ? <Spinner label="Checking your reset link" /> : hasSession ? (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Input label="New password" type="password" autoComplete="new-password" required
            error={errors.password?.message} {...register('password')} />
          <Input label="Confirm new password" type="password" autoComplete="new-password" required
            error={errors.confirm?.message} {...register('confirm')} />
          {formError && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
              {formError}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Save new password</Button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This reset link is no longer valid. Request a new one and open it from the same device.
          </p>
          <Link to="/forgot-password">
            <Button variant="outline" className="w-full">Request a new link</Button>
          </Link>
        </div>
      )}
    </AuthLayout>
  )
}
