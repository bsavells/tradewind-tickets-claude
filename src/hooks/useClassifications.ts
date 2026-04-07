import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Database } from '@/lib/database.types'

type Classification = Database['public']['Tables']['classifications']['Row']

export function useClassifications() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['classifications', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classifications')
        .select('*')
        .eq('company_id', profile!.company_id)
        .order('name')
      if (error) throw error
      return data as Classification[]
    },
    enabled: !!profile,
  })
}

export function useUpsertClassification() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (payload: {
      id?: string
      name: string
      default_reg_rate: number
      default_ot_rate: number
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('classifications') as any)
        .upsert({ ...payload, company_id: profile!.company_id })
        .select()
        .single()
      if (error) throw error
      return data as Classification
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['classifications'] }),
  })
}

export function useToggleClassificationActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('classifications') as any).update({ active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['classifications'] }),
  })
}
