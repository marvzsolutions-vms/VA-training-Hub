import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import AuthLayout from './AuthLayout'
import { Button, Input } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { readableError } from '../../lib/utils'

const schema = z.object({
  email: z.string().min(1, 'Enter your email address').email('Enter a valid email address'),
  password: z.string().min(6, 'Passwords are at least 6 characters'),
})
type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (values: FormValues) => {
    setFormError(null)
    try {
      await signIn(values.email.trim(), values.password)
      navigate('/dashboard', { replace: true })
    } catch (error) {
      setFormError(readableError(error))
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      description="Use the email address your Manager enrolled."
      footer={<>Trouble signing in? Email your Manager or coach.</>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input
          label="Email address" type="email" autoComplete="email" required
          placeholder="you@example.com"
          error={errors.email?.message} {...register('email')}
        />
        <Input
          label="Password" type="password" autoComplete="current-password" required
          placeholder="••••••••"
          error={errors.password?.message} {...register('password')}
        />

        {formError && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
            {formError}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Sign in</Button>

        <p className="text-center text-sm">
          <Link to="/forgot-password" className="rounded font-medium text-brand-700 hover:underline">
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
