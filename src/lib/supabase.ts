import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey)

/**
 * A client is always returned so the app can render a clear setup screen
 * instead of crashing when the environment variables are missing.
 */
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
)

/**
 * A throwaway client used when a Manager or Owner creates an account for
 * someone else. It never stores a session, so the staff member stays
 * signed in as themselves while the new auth user is created.
 */
export function createSignupClient() {
  return createClient(
    url ?? 'https://placeholder.supabase.co',
    anonKey ?? 'placeholder-anon-key',
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )
}
