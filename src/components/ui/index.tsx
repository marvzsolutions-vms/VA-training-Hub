import { forwardRef, useEffect } from 'react'
import type {
  ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes,
} from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Loader2, Search, X } from 'lucide-react'
import { cn } from '../../lib/utils'

/* --------------------------------- Button -------------------------------- */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm',
  secondary: 'bg-brand-50 text-brand-800 hover:bg-brand-100 border border-brand-100',
  outline: 'bg-white text-ink border border-canvas-line hover:bg-canvas hover:border-brand-200',
  ghost: 'text-ink-muted hover:bg-brand-50 hover:text-brand-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
}
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant], SIZES[size], className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})

/* --------------------------------- Inputs -------------------------------- */
interface FieldProps { label?: string; hint?: string; error?: string; required?: boolean }

const controlBase =
  'w-full rounded-xl border border-canvas-line bg-white px-3.5 py-2.5 text-sm text-ink ' +
  'placeholder:text-ink-soft transition-colors hover:border-brand-200 focus:border-brand-400 ' +
  'disabled:bg-canvas disabled:text-ink-soft'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(
  function Input({ label, hint, error, className, id, required, ...rest }, ref) {
    const fieldId = id ?? rest.name
    return (
      <div>
        {label && (
          <label htmlFor={fieldId} className="field-label">
            {label}{required && <span className="text-brand-600"> *</span>}
          </label>
        )}
        <input
          ref={ref} id={fieldId} required={required}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={cn(controlBase, error && 'border-rose-300', className)}
          {...rest}
        />
        {hint && !error && <p id={`${fieldId}-hint`} className="field-hint">{hint}</p>}
        {error && <p id={`${fieldId}-error`} className="field-error">{error}</p>}
      </div>
    )
  })

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(
  function Textarea({ label, hint, error, className, id, required, ...rest }, ref) {
    const fieldId = id ?? rest.name
    return (
      <div>
        {label && (
          <label htmlFor={fieldId} className="field-label">
            {label}{required && <span className="text-brand-600"> *</span>}
          </label>
        )}
        <textarea
          ref={ref} id={fieldId} required={required} aria-invalid={!!error}
          className={cn(controlBase, 'min-h-[110px] leading-6', error && 'border-rose-300', className)}
          {...rest}
        />
        {hint && !error && <p className="field-hint">{hint}</p>}
        {error && <p className="field-error">{error}</p>}
      </div>
    )
  })

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldProps>(
  function Select({ label, hint, error, className, id, children, required, ...rest }, ref) {
    const fieldId = id ?? rest.name
    return (
      <div>
        {label && (
          <label htmlFor={fieldId} className="field-label">
            {label}{required && <span className="text-brand-600"> *</span>}
          </label>
        )}
        <select
          ref={ref} id={fieldId} required={required} aria-invalid={!!error}
          className={cn(controlBase, 'pr-9', error && 'border-rose-300', className)}
          {...rest}
        >
          {children}
        </select>
        {hint && !error && <p className="field-hint">{hint}</p>}
        {error && <p className="field-error">{error}</p>}
      </div>
    )
  })

export function SearchInput(
  { value, onChange, placeholder = 'Search', label }:
  { value: string; onChange: (v: string) => void; placeholder?: string; label?: string },
) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
      <input
        type="search"
        aria-label={label ?? placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(controlBase, 'pl-9')}
      />
    </div>
  )
}

/* ---------------------------------- Card --------------------------------- */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card p-5', className)}>{children}</div>
}

export function SectionHeading(
  { title, description, action }:
  { title: string; description?: string; action?: ReactNode },
) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader(
  { title, description, action, eyebrow }:
  { title: string; description?: string; action?: ReactNode; eyebrow?: string },
) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-bold text-ink sm:text-[1.7rem]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </header>
  )
}

/* --------------------------------- Badge --------------------------------- */
type BadgeTone = 'brand' | 'neutral' | 'success' | 'warning' | 'danger' | 'info'
const BADGE_TONES: Record<BadgeTone, string> = {
  brand: 'bg-brand-50 text-brand-700 border-brand-100',
  neutral: 'bg-canvas text-ink-muted border-canvas-line',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  warning: 'bg-amber-50 text-amber-800 border-amber-100',
  danger: 'bg-rose-50 text-rose-700 border-rose-100',
  info: 'bg-sky-50 text-sky-700 border-sky-100',
}

export function Badge(
  { children, tone = 'neutral', className }:
  { children: ReactNode; tone?: BadgeTone; className?: string },
) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
      BADGE_TONES[tone], className,
    )}>
      {children}
    </span>
  )
}

/* -------------------------------- Progress ------------------------------- */
export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex justify-between text-xs text-ink-muted">
          <span>{label}</span><span className="font-medium text-ink">{safe}%</span>
        </div>
      )}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-brand-50"
        role="progressbar" aria-valuenow={safe} aria-valuemin={0} aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${safe}%` }} />
      </div>
    </div>
  )
}

/* ------------------------------ States ----------------------------------- */
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span>{label}…</span>
    </div>
  )
}

export function EmptyState(
  { title, description, action, icon: Icon }:
  { title: string; description?: string; action?: ReactNode; icon?: React.ElementType },
) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      {Icon && (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card border-rose-200 bg-rose-50/60 p-5">
      <p className="text-sm font-medium text-rose-900">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Try again</Button>
      )}
    </div>
  )
}

/* -------------------------------- Modal ---------------------------------- */
export function Modal(
  { open, onClose, title, description, children, footer, wide }:
  {
    open: boolean; onClose: () => void; title: string; description?: string
    children?: ReactNode; footer?: ReactNode; wide?: boolean
  },
) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = '' }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={cn(
          'relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-pop animate-fade-up sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog"
            className="rounded-lg p-1 text-ink-soft hover:bg-canvas hover:text-ink">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog(
  { open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', tone = 'primary', loading }:
  {
    open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string
    confirmLabel?: string; tone?: 'primary' | 'danger'; loading?: boolean
  },
) {
  return (
    <Modal
      open={open} onClose={onClose} title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm text-ink-muted">{message}</p>
    </Modal>
  )
}

/* -------------------------------- Table ---------------------------------- */
export function DataTable<T>(
  { rows, columns, empty, keyOf }:
  {
    rows: T[]
    columns: Array<{ header: string; cell: (row: T) => ReactNode; className?: string }>
    empty: ReactNode
    keyOf: (row: T) => string
  },
) {
  if (rows.length === 0) return <>{empty}</>
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-canvas-line bg-canvas/60">
              {columns.map((col) => (
                <th key={col.header}
                  className={cn('px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-soft', col.className)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={keyOf(row)} className="border-b border-canvas-line/70 last:border-0 hover:bg-brand-50/40">
                {columns.map((col) => (
                  <td key={col.header} className={cn('px-4 py-3 align-middle text-ink-muted', col.className)}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ------------------------------ Pagination -------------------------------- */
export function Pagination(
  { page, pageCount, onChange }:
  { page: number; pageCount: number; onChange: (page: number) => void },
) {
  if (pageCount <= 1) return null
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <p className="text-xs text-ink-muted">Page {page} of {pageCount}</p>
      <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </nav>
  )
}

/* ------------------------------ Breadcrumbs ------------------------------- */
export function Breadcrumbs({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-xs text-ink-soft">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden />}
          {item.to
            ? <Link to={item.to} className="rounded hover:text-brand-700 hover:underline">{item.label}</Link>
            : <span className="font-medium text-ink-muted">{item.label}</span>}
        </span>
      ))}
    </nav>
  )
}

/* ------------------------------ Stat card --------------------------------- */
export function StatCard(
  { label, value, hint, icon: Icon, tone = 'brand' }:
  { label: string; value: ReactNode; hint?: string; icon?: React.ElementType; tone?: BadgeTone },
) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-ink">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-ink-muted">{hint}</p>}
        </div>
        {Icon && (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
            BADGE_TONES[tone])}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
    </div>
  )
}

/** Every external link in the app goes through here. */
export function ExternalLink(
  { href, children, className }: { href: string; children: ReactNode; className?: string },
) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={className}>
      {children}
    </a>
  )
}
