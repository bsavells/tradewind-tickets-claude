import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { enqueue as enqueueSync } from '@/lib/syncQueue'

/**
 * Result type for mutations that may be queued when the network is down.
 * Use `'queued' in result` to discriminate at the callsite.
 */
export type QueuedResult<T> = T | { queued: true }

/** Network-shaped failures we should defer to the retry queue. */
function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (err as any)?.status
  if (typeof status === 'number') {
    return status >= 500 || status === 408 || status === 429 || status === 0
  }
  const msg = String((err as Error)?.message ?? '').toLowerCase()
  return msg.includes('network') || msg.includes('failed to fetch') || msg.includes('timeout')
}
import type { Database } from '@/lib/database.types'

type Ticket = Database['public']['Tables']['tickets']['Row']
type TicketStatus = Database['public']['Tables']['tickets']['Row']['status']

export interface TicketMaterialInput {
  id?: string
  sort_order: number
  qty: number
  part_number: string
  description: string
}

export interface TicketLaborInput {
  id?: string
  sort_order: number
  user_id: string | null
  first_name: string
  last_name: string
  classification_snapshot: string
  /** 'clock' uses start/end to compute hours; 'flat' stores hours directly. */
  entry_mode: 'clock' | 'flat'
  start_time: string
  end_time: string
  hours: number | null
  reg_rate: number | null
}

export interface TicketVehicleInput {
  id?: string
  sort_order: number
  vehicle_id: string | null
  vehicle_label: string
  mileage_start: number | null
  mileage_end: number | null
  rate: number | null
}

export interface TicketEquipmentInput {
  id?: string
  sort_order: number
  equip_number: string
  hours: number | null
  rate: number | null
}

export interface TicketFormData {
  customer_id: string
  requestor: string
  job_number: string
  job_location: string
  job_problem: string
  ticket_type: string
  work_date: string
  work_description: string
  equipment_enabled: boolean
  materials: TicketMaterialInput[]
  labor: TicketLaborInput[]
  vehicles: TicketVehicleInput[]
  equipment: TicketEquipmentInput[]
}

// --- List: tech sees own tickets, admin sees all ---
export function useMyTickets() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['tickets', 'mine', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*, customers(name), ticket_audit_log(action, occurred_at), ticket_photos(id)')
        .eq('created_by', profile!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as (Ticket & {
        customers: { name: string }
        ticket_audit_log: { action: string; occurred_at: string }[]
        ticket_photos: { id: string }[]
      })[]
    },
    enabled: !!profile,
    refetchInterval: 2 * 60 * 1000, // silent 2-min poll catches any missed Realtime events
    refetchIntervalInBackground: false, // only poll when tab is active
  })
}

export function useAllTickets(statusFilter?: TicketStatus) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['tickets', 'all', profile?.company_id, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('tickets')
        .select('*, customers(name), profiles!tickets_created_by_fkey(first_name, last_name), ticket_audit_log(action, occurred_at), ticket_photos(id)')
        .eq('company_id', profile!.company_id)
        .order('created_at', { ascending: false })
      if (statusFilter) q = q.eq('status', statusFilter)
      const { data, error } = await q
      if (error) throw error
      return data as (Ticket & {
        customers: { name: string }
        profiles: { first_name: string; last_name: string }
        ticket_photos: { id: string }[]
      })[]
    },
    enabled: !!profile,
    refetchInterval: 2 * 60 * 1000,
    refetchIntervalInBackground: false,
  })
}

// --- Single ticket with all child data ---
export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          customers(name, customer_contacts(*)),
          profiles!tickets_created_by_fkey(first_name, last_name),
          ticket_materials(*),
          ticket_labor(*),
          ticket_vehicles(*),
          ticket_equipment(*),
          ticket_photos(*),
          ticket_signatures(*),
          ticket_audit_log(*)
        `)
        .eq('id', id!)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
    // Always refetch on mount so signatures, photos, and is_signed are fresh
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

// --- Create a new draft ticket with all child rows ---
export function useCreateTicket() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (form: TicketFormData): Promise<QueuedResult<Ticket>> => {
      const queueOp = () => enqueueSync({
        kind: 'ticket_create',
        form,
        companyId: profile!.company_id,
        actorId: profile!.id,
        actorName: `${profile!.first_name} ${profile!.last_name}`,
      })

      // Pre-flight: if we know we're offline, skip the request entirely.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await queueOp()
        return { queued: true }
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: ticketNumber, error: numErr } = await (supabase.rpc as any)(
          'next_ticket_number', { p_company_id: profile!.company_id }
        )
        if (numErr) throw numErr

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: ticket, error: ticketErr } = await (supabase.from('tickets') as any)
          .insert({
            company_id: profile!.company_id,
            ticket_number: ticketNumber,
            customer_id: form.customer_id,
            requestor: form.requestor,
            job_number: form.job_number || null,
            job_location: form.job_location || null,
            job_problem: form.job_problem || null,
            ticket_type: form.ticket_type || null,
            work_date: form.work_date,
            work_description: form.work_description || null,
            equipment_enabled: form.equipment_enabled,
            status: 'draft',
            created_by: profile!.id,
          })
          .select()
          .single()
        if (ticketErr) throw ticketErr

        const ticketId = ticket.id
        await saveChildRows(ticketId, form)
        return ticket as Ticket
      } catch (err) {
        if (isRetryableError(err)) {
          await queueOp()
          return { queued: true }
        }
        throw err
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

// --- Update an existing draft/returned ticket ---
export function useUpdateTicket() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (
      { id, form }: { id: string; form: TicketFormData },
    ): Promise<QueuedResult<void>> => {
      const queueOp = () => enqueueSync({ kind: 'ticket_update', ticketId: id, form })

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await queueOp()
        return { queued: true }
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('tickets') as any)
          .update({
            customer_id: form.customer_id,
            requestor: form.requestor,
            job_number: form.job_number || null,
            job_location: form.job_location || null,
            job_problem: form.job_problem || null,
            ticket_type: form.ticket_type || null,
            work_date: form.work_date,
            work_description: form.work_description || null,
            equipment_enabled: form.equipment_enabled,
          })
          .eq('id', id)
        if (error) throw error

        await deleteChildRows(id)
        await saveChildRows(id, form)
        return undefined
      } catch (err) {
        if (isRetryableError(err)) {
          await queueOp()
          return { queued: true }
        }
        throw err
      }
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['ticket', id] })
    },
  })
}

// --- Submit ticket ---
export function useSubmitTicket() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (ticketId: string): Promise<QueuedResult<void>> => {
      const queueOp = () => enqueueSync({
        kind: 'ticket_submit',
        ticketId,
        actorId: profile!.id,
        actorName: `${profile!.first_name} ${profile!.last_name}`,
      })

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await queueOp()
        return { queued: true }
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('tickets') as any)
          .update({ status: 'submitted' })
          .eq('id', ticketId)
          .in('status', ['draft', 'returned'])
        if (error) throw error

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('ticket_audit_log') as any).insert({
          ticket_id: ticketId,
          actor_id: profile!.id,
          actor_name: `${profile!.first_name} ${profile!.last_name}`,
          action: 'submitted',
        })

        // Fire-and-forget: notify admins
        supabase.functions.invoke('notify-ticket-event', {
          body: { ticket_id: ticketId, event_kind: 'ticket_submitted' },
        }).catch(console.error)
        return undefined
      } catch (err) {
        if (isRetryableError(err)) {
          await queueOp()
          return { queued: true }
        }
        throw err
      }
    },
    onSuccess: (_data, ticketId) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
    },
  })
}

// --- Delete a ticket ---
// Uses a SECURITY DEFINER RPC to avoid a Postgres cascade + AFTER-trigger
// conflict where our grand-total recompute triggers try to UPDATE the tickets
// row while it is itself being CASCADE-deleted.
export function useDeleteTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ticketId: string) => {
      // Notify BEFORE deleting so the edge function can still read the ticket.
      // Errors are swallowed so a notification failure never blocks deletion.
      await supabase.functions.invoke('notify-ticket-event', {
        body: { ticket_id: ticketId, event_kind: 'ticket_deleted' },
      }).catch(console.error)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('delete_ticket_safe', { p_ticket_id: ticketId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  })
}

// --- Admin: update line item pricing/overrides ---
export interface AdminLineEdits {
  materials?: { id: string; price_each: number | null }[]
  labor?: {
    id: string
    reg_rate: number | null
    ot_rate: number | null
    reg_hours: number | null
    ot_hours: number | null
    entry_mode?: 'clock' | 'flat'
    start_time?: string | null
    end_time?: string | null
    hours?: number | null
  }[]
  vehicles?: { id: string; rate: number | null }[]
  equipment?: { id: string; rate: number | null; hours: number | null }[]
}

export function useAdminUpdateTicketPricing() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ ticketId, edits }: { ticketId: string; edits: AdminLineEdits }) => {
      const updates: Promise<unknown>[] = []

      for (const m of edits.materials ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updates.push((supabase.from('ticket_materials') as any)
          .update({ price_each: m.price_each }).eq('id', m.id))
      }
      for (const l of edits.labor ?? []) {
        // Only include the optional fields when supplied so admin pricing-only
        // saves don't accidentally clobber start/end/hours/entry_mode.
        const patch: Record<string, unknown> = {
          reg_rate: l.reg_rate,
          ot_rate: l.ot_rate,
          reg_hours: l.reg_hours,
          ot_hours: l.ot_hours,
        }
        if (l.entry_mode !== undefined) patch.entry_mode = l.entry_mode
        if (l.start_time !== undefined) patch.start_time = l.start_time
        if (l.end_time !== undefined) patch.end_time = l.end_time
        if (l.hours !== undefined) patch.hours = l.hours
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updates.push((supabase.from('ticket_labor') as any).update(patch).eq('id', l.id))
      }
      for (const v of edits.vehicles ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updates.push((supabase.from('ticket_vehicles') as any)
          .update({ rate: v.rate }).eq('id', v.id))
      }
      for (const e of edits.equipment ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updates.push((supabase.from('ticket_equipment') as any)
          .update({ rate: e.rate, hours: e.hours }).eq('id', e.id))
      }

      const results = await Promise.all(updates)
      for (const r of results) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = (r as any)?.error
        if (err) throw err
      }

      // Parallel UPDATEs each fire the per-row AFTER trigger that recomputes
      // tickets.grand_total. Because the updates run in independent
      // transactions, the SUMs they read can see stale data from the other
      // pending transactions, leaving tickets.grand_total wrong (e.g. only
      // the last writer's contribution). After all updates complete, force
      // a final recompute that sees the committed state.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: rpcErr } = await (supabase.rpc as any)(
        'recompute_ticket_grand_total',
        { p_ticket_id: ticketId },
      )
      if (rpcErr) throw rpcErr

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('ticket_audit_log') as any).insert({
        ticket_id: ticketId,
        actor_id: profile!.id,
        actor_name: `${profile!.first_name} ${profile!.last_name}`,
        action: 'edited_by_admin',
      })
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
    },
  })
}

// --- Admin: finalize a ticket ---
export function useFinalizeTicket() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (ticketId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('tickets') as any)
        .update({
          status: 'finalized',
          finalized_at: new Date().toISOString(),
          finalized_by: profile!.id,
          has_post_finalize_changes: false,
        })
        .eq('id', ticketId)
      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('ticket_audit_log') as any).insert({
        ticket_id: ticketId,
        actor_id: profile!.id,
        actor_name: `${profile!.first_name} ${profile!.last_name}`,
        action: 'finalized',
      })

      // Fire-and-forget: notify ticket creator
      supabase.functions.invoke('notify-ticket-event', {
        body: { ticket_id: ticketId, event_kind: 'ticket_finalized' },
      }).catch(console.error)
    },
    onSuccess: (_data, ticketId) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
    },
  })
}

// --- Admin: unfinalize a ticket (revert to submitted) ---
export function useUnfinalizeTicket() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (ticketId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('tickets') as any)
        .update({
          status: 'submitted',
          finalized_at: null,
          finalized_by: null,
          has_post_finalize_changes: false,
        })
        .eq('id', ticketId)
      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('ticket_audit_log') as any).insert({
        ticket_id: ticketId,
        actor_id: profile!.id,
        actor_name: `${profile!.first_name} ${profile!.last_name}`,
        action: 'unfinalized',
      })
    },
    onSuccess: (_data, ticketId) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
    },
  })
}

// --- Admin: return a ticket to the tech ---
export function useReturnTicket() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ ticketId, note }: { ticketId: string; note?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('tickets') as any)
        .update({ status: 'returned' })
        .eq('id', ticketId)
      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('ticket_audit_log') as any).insert({
        ticket_id: ticketId,
        actor_id: profile!.id,
        actor_name: `${profile!.first_name} ${profile!.last_name}`,
        action: 'returned',
        note: note ?? null,
      })

      // Fire-and-forget: notify ticket creator
      supabase.functions.invoke('notify-ticket-event', {
        body: { ticket_id: ticketId, event_kind: 'ticket_returned' },
      }).catch(console.error)
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
    },
  })
}

// --- Dashboard stats ---
export function useTicketStats() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['ticket-stats', profile?.company_id],
    queryFn: async () => {
      const companyId = profile!.company_id
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const [pending, finalizedMonth, drafts, total] = await Promise.all([
        supabase.from('tickets').select('id', { count: 'exact', head: true })
          .eq('company_id', companyId).eq('status', 'submitted'),
        supabase.from('tickets').select('id', { count: 'exact', head: true })
          .eq('company_id', companyId).eq('status', 'finalized')
          .gte('finalized_at', startOfMonth.toISOString()),
        supabase.from('tickets').select('id', { count: 'exact', head: true })
          .eq('company_id', companyId).in('status', ['draft', 'returned']),
        supabase.from('tickets').select('id', { count: 'exact', head: true })
          .eq('company_id', companyId),
      ])

      return {
        pending: pending.count ?? 0,
        finalizedThisMonth: finalizedMonth.count ?? 0,
        drafts: drafts.count ?? 0,
        total: total.count ?? 0,
      }
    },
    enabled: !!profile,
    refetchInterval: 2 * 60 * 1000,
    refetchIntervalInBackground: false,
  })
}

// --- Request return ---
export function useRequestReturn() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ ticketId, note }: { ticketId: string; note?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('ticket_audit_log') as any).insert({
        ticket_id: ticketId,
        actor_id: profile!.id,
        actor_name: `${profile!.first_name} ${profile!.last_name}`,
        action: 'return_requested',
        note: note ?? null,
      })
      if (error) throw error

      // Fire-and-forget: notify admins
      supabase.functions.invoke('notify-ticket-event', {
        body: { ticket_id: ticketId, event_kind: 'ticket_return_requested' },
      }).catch(console.error)
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
    },
  })
}

// --- Log an export event ---
export function useLogTicketExport() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ ticketId, format }: { ticketId: string; format: 'pdf' | 'xlsx' }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('ticket_audit_log') as any).insert({
        ticket_id: ticketId,
        actor_id: profile!.id,
        actor_name: `${profile!.first_name} ${profile!.last_name}`,
        action: 'exported',
        note: `Exported as ${format.toUpperCase()}`,
      })
      if (error) throw error
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
    },
  })
}

// --- Helpers ---
async function deleteChildRows(ticketId: string) {
  await Promise.all([
    supabase.from('ticket_materials').delete().eq('ticket_id', ticketId),
    supabase.from('ticket_labor').delete().eq('ticket_id', ticketId),
    supabase.from('ticket_vehicles').delete().eq('ticket_id', ticketId),
    supabase.from('ticket_equipment').delete().eq('ticket_id', ticketId),
  ])
}

async function saveChildRows(ticketId: string, form: TicketFormData) {
  const inserts: Promise<unknown>[] = []

  if (form.materials.length) {
    inserts.push(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from('ticket_materials') as any).insert(
        form.materials.map(m => ({
          ticket_id: ticketId,
          sort_order: m.sort_order,
          qty: m.qty,
          part_number: m.part_number || null,
          description: m.description || null,
        }))
      )
    )
  }

  if (form.labor.length) {
    inserts.push(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from('ticket_labor') as any).insert(
        form.labor.map(l => {
          const isFlat = l.entry_mode === 'flat'
          return {
            ticket_id: ticketId,
            sort_order: l.sort_order,
            user_id: l.user_id || null,
            first_name: l.first_name,
            last_name: l.last_name,
            classification_snapshot: l.classification_snapshot || null,
            entry_mode: isFlat ? 'flat' : 'clock',
            // Flat rows persist as start/end NULL with hours coming from the manual input.
            start_time: isFlat ? null : (l.start_time || null),
            end_time: isFlat ? null : (l.end_time || null),
            hours: l.hours ?? null,
            reg_rate: l.reg_rate ?? null,
          }
        })
      )
    )
  }

  if (form.vehicles.length) {
    inserts.push(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from('ticket_vehicles') as any).insert(
        form.vehicles.map(v => ({
          ticket_id: ticketId,
          sort_order: v.sort_order,
          vehicle_id: v.vehicle_id || null,
          vehicle_label: v.vehicle_label || null,
          mileage_start: v.mileage_start ?? null,
          mileage_end: v.mileage_end ?? null,
          rate: v.rate ?? null,
        }))
      )
    )
  }

  if (form.equipment_enabled && form.equipment.length) {
    inserts.push(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from('ticket_equipment') as any).insert(
        form.equipment.map(e => ({
          ticket_id: ticketId,
          sort_order: e.sort_order,
          equip_number: e.equip_number || null,
          hours: e.hours ?? null,
          rate: e.rate ?? null,
        }))
      )
    )
  }

  await Promise.all(inserts)
}
