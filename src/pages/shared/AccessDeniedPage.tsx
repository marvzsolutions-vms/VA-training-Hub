import { Link, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Button } from '../../components/ui'

const REASONS: Record<string, { title: string; body: string }> = {
  role: {
    title: 'This page is for another role',
    body: 'Your account does not include this area of the academy. If you think that is wrong, ask your Manager to check your role.',
  },
  deactivated: {
    title: 'Your account is not active',
    body: 'A Manager has deactivated this account. Contact your Manager to have it restored.',
  },
  level: {
    title: 'This content needs a higher level',
    body: 'Finish your current level or ask a Manager to grant access, then try again.',
  },
}

export default function AccessDeniedPage() {
  const location = useLocation() as { state?: { reason?: string } }
  const reason = REASONS[location.state?.reason ?? 'role'] ?? REASONS.role

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="card max-w-md p-7 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <ShieldAlert className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="text-xl font-bold text-ink">{reason.title}</h1>
        <p className="mt-2 text-sm text-ink-muted">{reason.body}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/dashboard"><Button>Back to dashboard</Button></Link>
          <Link to="/login"><Button variant="outline">Sign in as someone else</Button></Link>
        </div>
      </div>
    </div>
  )
}
