import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Database } from '@/lib/database.types'

type Customer = Database['public']['Tables']['customers']['Row']
type CustomerContact = Database['public']['Tables']['customer_contacts']['Row']

export function useCustomers() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['customers', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*, customer_contacts(*)')
        .eq('company_id', profile!.company_id)
        .order('name')
      if (error) throw error
      const rows = data as (Customer & { customer_contacts: CustomerContact[] })[]
      // Sort contacts alphabetically by first name (case-insensitive). The
      // `name` field stores the contact's full name; sorting by the full
      // string yields first-name-alphabetical order ("Alice Smith" < "Bob Lee").
      return rows.map(c => ({
        ...c,
        customer_contacts: [...c.customer_contacts].sort((a, b) =>
          (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }),
        ),
      }))
    },
    enabled: !!profile,
  })
}

export function useUpsertCustomer() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (payload: { id?: string; name: string; address?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('customers') as any)
        .upsert({ ...payload, company_id: profile!.company_id })
        .select()
        .single()
      if (error) throw error
      return data as Customer
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useToggleCustomerActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('customers') as any).update({ active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useUpsertContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id?: string
      customer_id: string
      name: string
      title?: string | null
      phone?: string | null
      email?: string | null
      is_primary: boolean
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('customer_contacts') as any)
        .upsert(payload)
        .select()
        .single()
      if (error) throw error
      return data as CustomerContact
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customer_contacts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}
