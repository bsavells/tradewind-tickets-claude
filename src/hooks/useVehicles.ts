import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Database } from '@/lib/database.types'

type Vehicle = Database['public']['Tables']['vehicles']['Row']

export function useVehicles() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['vehicles', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*, profiles(first_name, last_name)')
        .eq('company_id', profile!.company_id)
        .order('label')
      if (error) throw error
      return data as (Vehicle & { profiles: { first_name: string; last_name: string } | null })[]
    },
    enabled: !!profile,
  })
}

export function useUpsertVehicle() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (payload: {
      id?: string
      label: string
      description?: string | null
      default_mileage_rate: number
      assigned_user_id?: string | null
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('vehicles') as any)
        .upsert({ ...payload, company_id: profile!.company_id })
        .select()
        .single()
      if (error) throw error
      return data as Vehicle
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  })
}

export function useToggleVehicleActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('vehicles') as any).update({ active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  })
}
