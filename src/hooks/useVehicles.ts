import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Database } from '@/lib/database.types'

type Vehicle = Database['public']['Tables']['vehicles']['Row']

// Simple query — no profile join to avoid bidirectional FK ambiguity.
// AdminVehiclesPage resolves assigned user names client-side via useProfiles.
export function useVehicles() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['vehicles', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('company_id', profile!.company_id)
        .order('label')
      if (error) throw error
      return data as Vehicle[]
    },
    enabled: !!profile,
  })
}

export interface VehiclePayload {
  id?: string
  label: string
  truck_number?: string | null
  make?: string | null
  model?: string | null
  year?: number | null
  color?: string | null
  license_plate?: string | null
  date_acquired?: string | null
  is_lease?: boolean
  lease_end_date?: string | null
  default_mileage_rate: number
  current_mileage?: number | null
  assigned_user_id?: string | null
  description?: string | null
}

export function useUpsertVehicle() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (payload: VehiclePayload) => {
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
