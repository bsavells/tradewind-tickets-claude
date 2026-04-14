import { useEffect, useId } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Notification {
  id: string
  company_id: string
  recipient_id: string
  ticket_id: string | null
  kind: string
  title: string
  body: string | null
  read: boolean
  dismissed: boolean
  created_at: string
}

export interface NotificationPref {
  user_id: string
  key: string
  email_enabled: boolean
  in_app_enabled: boolean
}

// ── Fetch recent non-dismissed notifications for bell dropdown ────────────────
export function useNotifications() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['notifications', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', profile!.id)
        .eq('dismissed', false)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data as Notification[]
    },
    enabled: !!profile,
  })
}

// ── All notifications paginated (for history page — includes dismissed) ───────
const HISTORY_PAGE_SIZE = 50

export function useAllNotifications(page = 0) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['notifications-history', profile?.id, page],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('recipient_id', profile!.id)
        .order('created_at', { ascending: false })
        .range(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE - 1)
      if (error) throw error
      return { notifications: data as Notification[], total: count ?? 0 }
    },
    enabled: !!profile,
  })
}

// ── Unread count (lightweight head query) ─────────────────────────────────────
export function useUnreadNotificationCount() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const instanceId = useId()

  useEffect(() => {
    if (!profile) return
    const channel = supabase
      .channel(`notifications:${profile.id}:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['notifications', profile.id] })
          qc.invalidateQueries({ queryKey: ['notifications-count', profile.id] })
          qc.invalidateQueries({ queryKey: ['notifications-history', profile.id] })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.id, qc])

  return useQuery({
    queryKey: ['notifications-count', profile?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', profile!.id)
        .eq('read', false)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!profile,
    refetchInterval: 60_000,
  })
}

// ── Mark notifications as read ────────────────────────────────────────────────
export function useMarkNotificationsRead() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (ids?: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase.from('notifications') as any)
        .update({ read: true })
        .eq('recipient_id', profile!.id)
        .eq('read', false)
      if (ids && ids.length > 0) q = q.in('id', ids)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', profile?.id] })
      qc.invalidateQueries({ queryKey: ['notifications-count', profile?.id] })
      qc.invalidateQueries({ queryKey: ['notifications-history', profile?.id] })
    },
  })
}

// ── Dismiss read notifications from popup (keeps them in history) ─────────────
export function useDismissReadNotifications() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ dismissed: true })
        .eq('recipient_id', profile!.id)
        .eq('read', true)
        .eq('dismissed', false)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', profile?.id] })
    },
  })
}

// ── Notification prefs for a specific user (self or admin managing another) ──
export function useNotificationPrefs(userId: string | undefined) {
  return useQuery({
    queryKey: ['notification-prefs', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_prefs')
        .select('*')
        .eq('user_id', userId!)
      if (error) throw error
      const map: Record<string, { email_enabled: boolean; in_app_enabled: boolean }> = {}
      for (const row of data as NotificationPref[]) {
        map[row.key] = { email_enabled: row.email_enabled, in_app_enabled: row.in_app_enabled }
      }
      return map
    },
    enabled: !!userId,
  })
}

// ── Upsert a single pref row ──────────────────────────────────────────────────
export function useUpsertNotificationPref() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      user_id,
      key,
      email_enabled,
      in_app_enabled,
    }: {
      user_id: string
      key: string
      email_enabled: boolean
      in_app_enabled: boolean
    }) => {
      const { error } = await supabase
        .from('notification_prefs')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ user_id, key, email_enabled, in_app_enabled } as any, {
          onConflict: 'user_id,key',
        })
      if (error) throw error
    },
    onSuccess: (_data, { user_id }) => {
      qc.invalidateQueries({ queryKey: ['notification-prefs', user_id] })
    },
  })
}
