import { Link } from 'react-router-dom'
import { Button } from '../../components/ui'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="card max-w-md p-7 text-center">
        <p className="font-display text-4xl font-extrabold text-brand-600">404</p>
        <h1 className="mt-2 text-xl font-bold text-ink">That page does not exist</h1>
        <p className="mt-2 text-sm text-ink-muted">
          The link may be outdated, or the content may have been moved.
        </p>
        <Link to="/dashboard" className="mt-6 inline-block"><Button>Back to dashboard</Button></Link>
      </div>
    </div>
  )
}
