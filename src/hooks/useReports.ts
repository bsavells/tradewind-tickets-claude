import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { ReportTicket } from '@/lib/reportUtils'

export interface ReportFilters {
  dateFrom: string      // ISO date yyyy-MM-dd
  dateTo: string        // ISO date yyyy-MM-dd
  customerIds: string[] // empty = all
  techIds: string[]     // empty = all (filters tickets.created_by)
  statuses: string[]    // empty = all
}

/**
 * Fetch tickets (with full ticket_labor rows) in the given filter window.
 * Aggregations are computed client-side from the returned rows —
 * see src/lib/reportUtils.ts.
 */
export function useReportTickets(filters: ReportFilters) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['reports', profile?.company_id, filters],
    queryFn: async (): Promise<ReportTicket[]> => {
      let q = supabase
        .from('tickets')
        .select(`
          id,
          ticket_number,
          status,
          work_date,
          grand_total,
          customer_id,
          created_by,
          customers(name),
          profiles!tickets_created_by_fkey(first_name, last_name),
          ticket_labor(user_id, first_name, last_name, hours, reg_hours, ot_hours)
        `)
        .eq('company_id', profile!.company_id)
        .gte('work_date', filters.dateFrom)
        .lte('work_date', filters.dateTo)
        .order('work_date', { ascending: false })

      if (filters.customerIds.length > 0) {
        q = q.in('customer_id', filters.customerIds)
      }
      if (filters.techIds.length > 0) {
        q = q.in('created_by', filters.techIds)
      }
      if (filters.statuses.length > 0) {
        q = q.in('status', filters.statuses as ('submitted' | 'returned' | 'finalized' | 'draft')[])
      }

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as ReportTicket[]
    },
    enabled: !!profile,
    staleTime: 30 * 1000,
  })
}
