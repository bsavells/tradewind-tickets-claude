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
        .select('*, classifications(name), vehicles(label)')
        .eq('company_id', profile!.company_id)
        .order('last_name')
      if (error) throw error
      return data as (Profile & {
        classifications: { name: string } | null
        vehicles: { label: string } | null
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
      role?: 'tech' | 'admin'
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

export function useInviteUser() {
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (payload: {
      email: string
      first_name: string
      last_name: string
      role: 'tech' | 'admin'
      is_readonly_admin: boolean
      classification_id: string | null
      default_vehicle_id: string | null
    }) => {
      const { data, error } = await supabase.auth.admin.createUser({
        email: payload.email,
        email_confirm: true,
        user_metadata: { first_name: payload.first_name, last_name: payload.last_name },
      })
      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: profileError } = await (supabase.from('profiles') as any)
        .update({
          first_name: payload.first_name,
          last_name: payload.last_name,
          role: payload.role,
          is_readonly_admin: payload.is_readonly_admin,
          classification_id: payload.classification_id,
          default_vehicle_id: payload.default_vehicle_id,
          company_id: profile!.company_id,
        })
        .eq('id', data.user.id)
      if (profileError) throw profileError

      return data.user
    },
  })
}
