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
            // Disabled by an admin — sign out and refresh to land on /login
            supabase.auth.signOut().finally(() => {
              window.location.href = '/login'
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

  // Also auto-sign-out if a profile fetch returns active=false (covers the
  // case where the browser was closed during disable and reopens later).
  useEffect(() => {
    if (!loading && profile && profile.active === false) {
      supabase.auth.signOut().finally(() => {
        window.location.href = '/login'
      })
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
