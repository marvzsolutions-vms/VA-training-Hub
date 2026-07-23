import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { Spinner } from '../components/ui'
import type { AppRole } from '../lib/types'

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <Spinner label="Loading your account" />
    </div>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  if (profile && !profile.is_active) {
    return <Navigate to="/access-denied" state={{ reason: 'deactivated' }} replace />
  }
  return <>{children}</>
}

export function RequireRole({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!profile) return <Navigate to="/login" replace />
  if (!roles.includes(profile.role)) {
    return <Navigate to="/access-denied" state={{ reason: 'role' }} replace />
  }
  return <>{children}</>
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (session) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
