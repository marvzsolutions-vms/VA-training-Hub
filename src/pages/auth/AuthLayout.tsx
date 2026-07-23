import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export default function AuthLayout(
  { title, description, children, footer }:
  { title: string; description?: string; children: ReactNode; footer?: ReactNode },
) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-base font-bold text-white">
              VA
            </span>
            <div>
              <p className="font-display text-lg font-bold text-ink">VA Success Academy</p>
              <p className="text-xs text-ink-soft">Practical VA training for Filipino beginners</p>
            </div>
          </div>

          <div className="card p-6 sm:p-7">
            <h1 className="text-xl font-bold text-ink">{title}</h1>
            {description && <p className="mt-1.5 text-sm text-ink-muted">{description}</p>}
            <div className="mt-6">{children}</div>
          </div>

          {footer && <div className="mt-4 text-center text-sm text-ink-muted">{footer}</div>}
        </div>
      </div>

      <footer className="border-t border-canvas-line bg-white px-4 py-4">
        <div className="mx-auto flex max-w-md flex-wrap justify-center gap-4 text-xs text-ink-soft">
          <Link to="/privacy" className="rounded hover:text-brand-700">Privacy policy</Link>
          <Link to="/terms" className="rounded hover:text-brand-700">Terms</Link>
        </div>
      </footer>
    </div>
  )
}
