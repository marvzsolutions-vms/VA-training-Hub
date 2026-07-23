import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from '../lib/supabase'
import type { AppRole, Branding, Profile, StudentProfile, ThemeMode } from '../lib/types'

interface AuthValue {
  session: Session | null
  profile: Profile | null
  student: StudentProfile | null
  specializationIds: string[]
  permissions: string[]
  branding: Branding | null
  role: AppRole | null
  loading: boolean
  configured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  sendResetEmail: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  refresh: () => Promise<void>
  can: (permission: string) => boolean
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => Promise<void>
}

const AuthContext = createContext<AuthValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [student, setStudent] = useState<StudentProfile | null>(null)
  const [specializationIds, setSpecializationIds] = useState<string[]>([])
  const [permissions, setPermissions] = useState<string[]>([])
  const [branding, setBranding] = useState<Branding | null>(null)
  const [loading, setLoading] = useState(true)

  const loadContext = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null); setStudent(null); setSpecializationIds([]); setPermissions([])
      return
    }
    const { data: profileRow } = await supabase
      .from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile((profileRow as Profile) ?? null)

    if (profileRow?.role === 'student') {
      const [{ data: studentRow }, { data: specs }] = await Promise.all([
        supabase.from('student_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('student_specializations').select('specialization_id').eq('student_id', userId),
      ])
      setStudent((studentRow as StudentProfile) ?? null)
      setSpecializationIds((specs ?? []).map((s: { specialization_id: string }) => s.specialization_id))
    } else {
      setStudent(null); setSpecializationIds([])
    }

    if (profileRow?.role) {
      const { data: perms } = await supabase
        .from('role_permissions')
        .select('granted, roles!inner(code), permissions!inner(code)')
        .eq('roles.code', profileRow.role)
      type PermRow = { granted: boolean; permissions: { code: string } | { code: string }[] }
      setPermissions(
        ((perms ?? []) as PermRow[])
          .filter((row) => row.granted)
          .map((row) => (Array.isArray(row.permissions) ? row.permissions[0]?.code : row.permissions?.code))
          .filter(Boolean) as string[],
      )
    }
  }, [])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    await loadContext(data.session?.user.id)
    const { data: brand } = await supabase.from('branding_settings').select('*').eq('id', 1).maybeSingle()
    if (brand) setBranding(brand as Branding)
  }, [loadContext])

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return }
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadContext(data.session?.user.id)
      if (active) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (!active) return
      setSession(next)
      await loadContext(next?.user.id)
      setLoading(false)
    })

    supabase.from('branding_settings').select('*').eq('id', 1).maybeSingle()
      .then(({ data }) => { if (active && data) setBranding(data as Branding) })

    return () => { active = false; sub.subscription.unsubscribe() }
  }, [loadContext])

  // Keep a light "last seen" signal for the activity dashboards.
  useEffect(() => {
    if (!session?.user.id) return
    supabase.from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', session.user.id)
      .then(() => undefined)
  }, [session?.user.id])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null); setStudent(null); setPermissions([])
  }, [])

  const sendResetEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }, [])


  const theme: ThemeMode = profile?.theme_preference ?? branding?.default_theme ?? 'light'

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])

  const setTheme = useCallback(async (nextTheme: ThemeMode) => {
    document.documentElement.dataset.theme = nextTheme
    document.documentElement.style.colorScheme = nextTheme
    if (!session?.user.id) return
    const { error } = await supabase.from('profiles').update({ theme_preference: nextTheme }).eq('id', session.user.id)
    if (error) throw error
    setProfile((current) => current ? { ...current, theme_preference: nextTheme } : current)
  }, [session?.user.id])

  const value = useMemo<AuthValue>(() => ({
    session, profile, student, specializationIds, permissions, branding,
    role: profile?.role ?? null,
    loading, configured: isConfigured,
    signIn, signOut, sendResetEmail, updatePassword, refresh,
    can: (permission: string) => profile?.role === 'owner' || permissions.includes(permission),
    theme, setTheme,
  }), [session, profile, student, specializationIds, permissions, branding, loading,
       signIn, signOut, sendResetEmail, updatePassword, refresh, theme, setTheme])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
