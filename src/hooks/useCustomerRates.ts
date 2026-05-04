import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Per-customer override rates by classification.
 *
 * The `customer_classification_rates` table only stores overrides — when no
 * row exists for a `(customer, classification)` pair, ticket flows fall back
 * to `classifications.default_reg_rate` / `default_ot_rate`. Empty overrides
 * are not persisted as zero rows; instead the row is deleted.
 */

export interface CustomerRate {
  reg_rate: number
  ot_rate: number
}

/** Map of classification_id → override rates for the given customer. */
export type CustomerRateMap = Map<string, CustomerRate>

/**
 * Reads all rate overrides for a customer. Returns an empty map when the
 * customer has no overrides at all (which is the common case).
 */
export function useCustomerRates(customerId: string | undefined) {
  return useQuery({
    queryKey: ['customer-rates', customerId],
    queryFn: async (): Promise<CustomerRateMap> => {
      if (!customerId) return new Map()
      const { data, error } = await supabase
        .from('customer_classification_rates')
        .select('classification_id, reg_rate, ot_rate')
        .eq('customer_id', customerId)
      if (error) throw error
      return new Map(
        (data ?? []).map(r => [
          r.classification_id,
          { reg_rate: Number(r.reg_rate), ot_rate: Number(r.ot_rate) },
        ]),
      )
    },
    enabled: !!customerId,
    staleTime: 30_000,
  })
}

/**
 * Bulk-save the override map for a customer.
 *
 * Diff against the existing server state:
 *   - cells that go from empty → set become INSERTs
 *   - cells with new values become UPDATEs (we use UPSERT for both)
 *   - cells that go from set → empty become DELETEs
 *
 * The caller passes the intended state; this hook reconciles.
 */
export function useSaveCustomerRates() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      customerId,
      desired,
      previous,
    }: {
      customerId: string
      desired: CustomerRateMap
      previous: CustomerRateMap
    }) => {
      const upserts: { classification_id: string; reg_rate: number; ot_rate: number }[] = []
      const deletes: string[] = []

      // Anything in `desired` is an upsert (new or changed).
      for (const [classId, rate] of desired) {
        const prev = previous.get(classId)
        if (!prev || prev.reg_rate !== rate.reg_rate || prev.ot_rate !== rate.ot_rate) {
          upserts.push({
            classification_id: classId,
            reg_rate: rate.reg_rate,
            ot_rate: rate.ot_rate,
          })
        }
      }

      // Anything previously set but not in desired is a delete.
      for (const [classId] of previous) {
        if (!desired.has(classId)) deletes.push(classId)
      }

      if (upserts.length) {
        const { error } = await supabase
          .from('customer_classification_rates')
          .upsert(
            upserts.map(u => ({ ...u, customer_id: customerId })),
            { onConflict: 'customer_id,classification_id' },
          )
        if (error) throw error
      }

      if (deletes.length) {
        const { error } = await supabase
          .from('customer_classification_rates')
          .delete()
          .eq('customer_id', customerId)
          .in('classification_id', deletes)
        if (error) throw error
      }

      return { upserted: upserts.length, deleted: deletes.length }
    },
    onSuccess: (_data, { customerId }) => {
      qc.invalidateQueries({ queryKey: ['customer-rates', customerId] })
    },
  })
}
