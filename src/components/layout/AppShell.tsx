import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Bell, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { navForRole, NAV_GROUP_ORDER } from '../../lib/navigation'
import { cn, initials, LEVEL_SHORT, ROLE_LABEL } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import { Badge } from '../ui'

function Logo({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 rounded-lg">
      {logoUrl ? <img src={logoUrl} alt="" className="h-9 w-9 rounded-xl object-contain" /> : <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">VA</span>}
      <span className="truncate font-display text-[15px] font-bold text-ink">{name}</span>
    </Link>
  )
}

export default function AppShell() {
  const { profile, student, branding, signOut } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [openQuestions, setOpenQuestions] = useState(0)

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!profile) return
    supabase.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id).eq('is_read', false)
      .then(({ count }) => setUnread(count ?? 0))
  }, [profile, location.pathname])

  useEffect(() => {
    if (!profile) return
    supabase.rpc('get_question_badge_count')
      .then(({ data, error }) => setOpenQuestions(error ? 0 : Number(data ?? 0)))
  }, [profile, location.pathname])

  if (!profile) return null
  const items = navForRole(profile.role)
  const appName = branding?.app_name ?? 'VA Success Academy'

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {NAV_GROUP_ORDER.map((group) => {
        const groupItems = items.filter((i) => i.group === group)
        if (groupItems.length === 0) return null
        return (
          <div key={group}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              {group}
            </p>
            <ul className="space-y-0.5">
              {groupItems.map((item) => (
                <li key={`${item.group}-${item.to}`}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-50 text-brand-800'
                        : 'text-ink-muted hover:bg-canvas hover:text-ink',
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>{item.to === '/questions' && openQuestions > 0 && <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">{openQuestions > 99 ? '99+' : openQuestions}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )

  const identity = (
    <div className="border-t border-canvas-line px-3 py-3">
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">{initials(profile.full_name || profile.email)}</span>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{profile.full_name}</p>
          <p className="truncate text-xs text-ink-soft">
            {ROLE_LABEL[profile.role]}
            {student && ` · ${LEVEL_SHORT[student.current_level]}`}
          </p>
        </div>
        <button
          type="button" onClick={signOut} aria-label="Sign out"
          className="rounded-lg p-1.5 text-ink-soft hover:bg-canvas hover:text-ink"
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-canvas-line bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-canvas-line px-5">
          <Logo name={appName} logoUrl={branding?.logo_url} />
        </div>
        {nav}
        {identity}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-pop">
            <div className="flex h-16 items-center justify-between border-b border-canvas-line px-4">
              <Logo name={appName} logoUrl={branding?.logo_url} />
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu"
                className="rounded-lg p-1.5 text-ink-soft hover:bg-canvas">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            {nav}
            {identity}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-canvas-line bg-white/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button" onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-ink-muted hover:bg-canvas lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1 lg:hidden">
            <Logo name={appName} logoUrl={branding?.logo_url} />
          </div>
          <div className="hidden flex-1 lg:block">
            {student && (
              <Badge tone="brand">{LEVEL_SHORT[student.current_level]} · {student.access_status.replace('_', ' ')}</Badge>
            )}
          </div>
          <Link
            to="/notifications"
            className="relative rounded-lg p-2 text-ink-muted hover:bg-canvas"
            aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          >
            <Bell className="h-5 w-5" aria-hidden />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
