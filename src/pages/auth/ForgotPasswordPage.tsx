import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import AuthLayout from './AuthLayout'
import { Button, Input } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { readableError } from '../../lib/utils'

const schema = z.object({
  email: z.string().min(1, 'Enter your email address').email('Enter a valid email address'),
})
type FormValues = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const { sendResetEmail } = useAuth()
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema), defaultValues: { email: '' },
  })

  const onSubmit = async (values: FormValues) => {
    setFormError(null)
    try {
      await sendResetEmail(values.email.trim())
      setSent(true)
    } catch (error) {
      setFormError(readableError(error))
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="We will email you a link that signs you in and lets you set a new password."
      footer={<Link to="/login" className="rounded font-medium text-brand-700 hover:underline">Back to sign in</Link>}
    >
      {sent ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Check your inbox. If an account exists for that address, a reset link is on its way.
          The link expires in one hour.
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Input
            label="Email address" type="email" autoComplete="email" required
            error={errors.email?.message} {...register('email')}
          />
          {formError && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
              {formError}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  )
}
