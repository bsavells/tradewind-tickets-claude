import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  isWritableAdmin: boolean
  isUser: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** True when the browser is currently on a public auth-related page. */
function isOnAuthPage(): boolean {
  const p = window.location.pathname
  return (
    p === '/login' ||
    p === '/forgot-password' ||
    p === '/reset-password' ||
    p.startsWith('/sign/')
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        setLoading(true)
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Watchdog: if the current profile flips to inactive (admin disabled the user),
  // sign them out immediately. Subscribes to realtime updates on this user's
  // profiles row so the sign-out happens within seconds of the admin action.
  //
  // Auth pages (/login, /forgot-password, /reset-password, /sign/:token) handle
  // their own error display when a deactivated user tries to sign in. We skip
  // the hard redirect there so their own UI isn't wiped by a full page reload.
  useEffect(() => {
    if (!session?.user?.id) return
    const userId = session.user.id

    const channel = supabase
      .channel(`profile-watchdog-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const next = payload.new as Profile | null
          if (next && next.active === false) {
            supabase.auth.signOut().finally(() => {
              if (!isOnAuthPage()) window.location.href = '/login'
            })
          } else if (next) {
            setProfile(next)
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.user?.id])

  // Fallback: if a profile fetch returns active=false (e.g. browser reopened
  // after being closed during disable), sign out quietly. We do NOT redirect
  // here because:
  //   - on a protected route, ProtectedRoute handles the redirect when the
  //     session clears, so its own flow is preserved
  //   - on an auth page, LoginPage shows its own "account deactivated" error
  //     and a hard redirect would wipe it before the user can read it
  useEffect(() => {
    if (!loading && profile && profile.active === false) {
      supabase.auth.signOut()
    }
  }, [loading, profile])

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  const isAdmin = profile?.role === 'admin' && (profile?.active ?? false)
  const isWritableAdmin = isAdmin && !(profile?.is_readonly_admin ?? true)
  const isUser = profile?.role === 'user' && (profile?.active ?? false)

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      loading,
      isAdmin,
      isWritableAdmin,
      isUser,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
