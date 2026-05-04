import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Catalog hooks (Phase 13.A).
 *
 * Three audiences read this catalog:
 *   1. Admins managing master data → `useCatalogVendors` + `useCatalogItemsAdmin`.
 *      RLS gates SELECT on the base `catalog_items` table to admins so only
 *      admins ever see `unit_cost` and `markup_pct`.
 *   2. Admins setting pricing on a ticket → same admin hooks; sell price is
 *      computed via `sellPrice(item)` below.
 *   3. Techs picking parts on a ticket form → `useCatalogItemsTechview`.
 *      Reads from the `catalog_items_techview` Postgres view, which omits
 *      `unit_cost` and `markup_pct` and runs as the view owner so techs can
 *      query it without SELECT permission on the base table.
 */

// ── Vendors ──────────────────────────────────────────────────────────────────

export interface CatalogVendor {
  id: string
  company_id: string
  name: string
  active: boolean
  created_at: string
}

export function useCatalogVendors() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['catalog-vendors', profile?.company_id],
    queryFn: async (): Promise<CatalogVendor[]> => {
      const { data, error } = await supabase
        .from('catalog_vendors')
        .select('*')
        .eq('company_id', profile!.company_id)
        .order('name')
      if (error) throw error
      return (data ?? []) as CatalogVendor[]
    },
    enabled: !!profile,
    staleTime: 60_000,
  })
}

export function useUpsertCatalogVendor() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; active?: boolean }) => {
      const row = {
        id: input.id,
        company_id: profile!.company_id,
        name: input.name.trim(),
        active: input.active ?? true,
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('catalog_vendors') as any)
        .upsert(row, { onConflict: 'id' })
        .select()
        .single()
      if (error) throw error
      return data as CatalogVendor
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog-vendors'] })
    },
  })
}

export function useDeleteCatalogVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('catalog_vendors').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog-vendors'] })
      // Items reference vendors; vendor delete is RESTRICTed at the DB level
      // when items exist, so the items list never goes stale by surprise.
    },
  })
}

// ── Items: admin view ────────────────────────────────────────────────────────

export interface CatalogItem {
  id: string
  vendor_id: string
  part_number: string | null
  description: string | null
  size: string | null
  packaging_unit: string | null
  unit_cost: number | null
  markup_pct: number
  active: boolean
  created_at: string
  updated_at: string
}

/** Admin-only: returns full catalog items including unit_cost + markup_pct. */
export function useCatalogItemsAdmin(filter?: { vendorId?: string; activeOnly?: boolean }) {
  const { profile, isAdmin } = useAuth()
  return useQuery({
    queryKey: ['catalog-items-admin', profile?.company_id, filter?.vendorId, filter?.activeOnly],
    queryFn: async (): Promise<CatalogItem[]> => {
      let q = supabase
        .from('catalog_items')
        .select('*, catalog_vendors!inner(company_id)')
        .eq('catalog_vendors.company_id', profile!.company_id)
        .order('part_number', { nullsFirst: false })
      if (filter?.vendorId) q = q.eq('vendor_id', filter.vendorId)
      if (filter?.activeOnly) q = q.eq('active', true)
      const { data, error } = await q
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map(({ catalog_vendors: _drop, ...rest }) => rest as CatalogItem)
    },
    // Only admins have RLS access to the base table; techs would get an empty
    // result. Disable rather than send a doomed request.
    enabled: !!profile && isAdmin,
    staleTime: 60_000,
  })
}

export function useUpsertCatalogItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<CatalogItem> & { vendor_id: string }) => {
      const row = {
        ...input,
        // Trim text fields; let null/undefined stay so we don't overwrite on partial updates.
        part_number: input.part_number?.trim() || null,
        description: input.description?.trim() || null,
        size: input.size?.trim() || null,
        packaging_unit: input.packaging_unit?.trim() || null,
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('catalog_items') as any)
        .upsert(row, { onConflict: 'id' })
        .select()
        .single()
      if (error) throw error
      return data as CatalogItem
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog-items-admin'] })
      qc.invalidateQueries({ queryKey: ['catalog-items-tech'] })
    },
  })
}

export function useDeleteCatalogItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('catalog_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog-items-admin'] })
      qc.invalidateQueries({ queryKey: ['catalog-items-tech'] })
    },
  })
}

/** Sell price = unit_cost * (1 + markup_pct/100). Returns null when cost missing. */
export function sellPrice(item: Pick<CatalogItem, 'unit_cost' | 'markup_pct'>): number | null {
  if (item.unit_cost == null) return null
  return Number((item.unit_cost * (1 + Number(item.markup_pct) / 100)).toFixed(2))
}

// ── Items: tech-safe view ────────────────────────────────────────────────────

export interface CatalogItemTech {
  id: string
  vendor_id: string
  vendor_name: string
  part_number: string | null
  description: string | null
  size: string | null
  packaging_unit: string | null
  active: boolean
}

/**
 * Tech-safe: reads from catalog_items_techview which is scoped to the user's
 * company and omits unit_cost + markup_pct entirely. Safe to expose in the
 * tech ticket form's part picker.
 */
export function useCatalogItemsTechview(filter?: { activeOnly?: boolean }) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['catalog-items-tech', profile?.company_id, filter?.activeOnly],
    queryFn: async (): Promise<CatalogItemTech[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase.from('catalog_items_techview') as any).select('*')
      if (filter?.activeOnly) q = q.eq('active', true)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as CatalogItemTech[]
    },
    enabled: !!profile,
    staleTime: 60_000,
  })
}
