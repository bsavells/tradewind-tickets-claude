import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
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
        .select('*, customers(name)')
        .eq('created_by', profile!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as (Ticket & { customers: { name: string } })[]
    },
    enabled: !!profile,
  })
}

export function useAllTickets(statusFilter?: TicketStatus) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['tickets', 'all', profile?.company_id, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('tickets')
        .select('*, customers(name), profiles!tickets_created_by_fkey(first_name, last_name)')
        .eq('company_id', profile!.company_id)
        .order('created_at', { ascending: false })
      if (statusFilter) q = q.eq('status', statusFilter)
      const { data, error } = await q
      if (error) throw error
      return data as (Ticket & {
        customers: { name: string }
        profiles: { first_name: string; last_name: string }
      })[]
    },
    enabled: !!profile,
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
          ticket_signatures(*)
        `)
        .eq('id', id!)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

// --- Create a new draft ticket with all child rows ---
export function useCreateTicket() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (form: TicketFormData) => {
      // 1. Generate ticket number via RPC
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ticketNumber, error: numErr } = await (supabase.rpc as any)(
        'next_ticket_number', { p_company_id: profile!.company_id }
      )
      if (numErr) throw numErr

      // 2. Insert ticket
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
    mutationFn: async ({ id, form }: { id: string; form: TicketFormData }) => {
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

      // Replace all child rows
      await deleteChildRows(id)
      await saveChildRows(id, form)
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
    mutationFn: async (ticketId: string) => {
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
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  })
}

// --- Request return ---
export function useRequestReturn() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ ticketId, note }: { ticketId: string; note?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('ticket_audit_log') as any).insert({
        ticket_id: ticketId,
        actor_id: profile!.id,
        actor_name: `${profile!.first_name} ${profile!.last_name}`,
        action: 'return_requested',
        note: note ?? null,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
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
        form.labor.map(l => ({
          ticket_id: ticketId,
          sort_order: l.sort_order,
          user_id: l.user_id || null,
          first_name: l.first_name,
          last_name: l.last_name,
          classification_snapshot: l.classification_snapshot || null,
          start_time: l.start_time || null,
          end_time: l.end_time || null,
          hours: l.hours ?? null,
          reg_rate: l.reg_rate ?? null,
        }))
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
