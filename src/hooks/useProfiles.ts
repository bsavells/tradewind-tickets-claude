import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Database } from '@/lib/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

export function useProfiles() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['profiles', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, classifications!profiles_classification_id_fkey(name)')
        .eq('company_id', profile!.company_id)
        .order('last_name')
      if (error) throw error
      return data as (Profile & {
        classifications: { name: string } | null
      })[]
    },
    enabled: !!profile,
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string
      first_name?: string
      last_name?: string
      role?: 'user' | 'admin'
      is_readonly_admin?: boolean
      classification_id?: string | null
      default_vehicle_id?: string | null
      active?: boolean
    }) => {
      const { id, ...updates } = payload
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('profiles') as any).update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

async function callManageUser(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('manage-user', { body })
  // Prefer the detailed error from the Edge Function response body over the
  // generic "Edge Function returned a non-2xx status code" from the client.
  if (data?.error) throw new Error(data.error)
  if (error) {
    // supabase-js wraps non-2xx responses in a FunctionsHttpError. The original
    // Response is on `.context` — try to read the body for the detailed message.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any).context as Response | undefined
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.clone().json()
        if (body?.error) throw new Error(body.error)
      } catch {
        // fall through to generic throw below
      }
    }
    throw error
  }
  return data
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      email: string
      first_name: string
      last_name: string
      role: 'user' | 'admin'
      is_readonly_admin: boolean
      classification_id: string | null
      default_vehicle_id: string | null
    }) => callManageUser({ action: 'create', ...payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (user_id: string) => callManageUser({ action: 'delete', user_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useReactivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (user_id: string) => callManageUser({ action: 'reactivate', user_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function usePermanentlyDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (user_id: string) => callManageUser({ action: 'permanent_delete', user_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useSendPasswordReset() {
  return useMutation({
    mutationFn: (email: string) => callManageUser({ action: 'send_reset', email }),
  })
}

export function useResendInvite() {
  return useMutation({
    mutationFn: (email: string) => callManageUser({ action: 'resend_invite', email }),
  })
}
