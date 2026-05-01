import { supabase } from '@/lib/supabase'
import {
  type QueueEntry,
  type SyncOp,
  dequeue,
  listQueue,
  subscribeToQueueChanges,
  updateEntry,
} from '@/lib/syncQueue'

/**
 * Drains the sync queue when the network is available.
 *
 * Triggered on:
 *  - `online` browser event
 *  - app boot (in case ops were queued in a prior session)
 *  - manual `runOnce()` call (e.g. after user reconnects mid-session)
 *
 * Ops execute sequentially. A retryable failure (network error, 5xx, timeout)
 * stops the drain immediately so we don't hammer the network during a flaky
 * connection — the next `online` event picks up where we left off. A fatal
 * failure (4xx auth/validation) marks the entry as `fatal` so the runner
 * skips it on subsequent passes; the user has to clear or resolve it.
 */

const MAX_ATTEMPTS = 8

let running = false

export interface OpCompletedEvent {
  kind: SyncOp['kind']
  ticketId?: string
}

const completionListeners = new Set<(e: OpCompletedEvent) => void>()

export function onOpCompleted(fn: (e: OpCompletedEvent) => void): () => void {
  completionListeners.add(fn)
  return () => {
    completionListeners.delete(fn)
  }
}

function emitCompleted(e: OpCompletedEvent) {
  for (const fn of completionListeners) fn(e)
}

// ── Public entry point ──────────────────────────────────────────────────────

let started = false

export function startSyncRunner(): void {
  if (started) return
  started = true
  window.addEventListener('online', () => { void runOnce() })
  // Also re-drain whenever the queue changes (e.g. user enqueues something
  // while online — runner picks it up immediately instead of waiting for the
  // next online event).
  subscribeToQueueChanges(() => { void runOnce() })
  // Boot pass — handles ops persisted from a previous session.
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    void runOnce()
  }
}

export async function runOnce(): Promise<void> {
  if (running) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  running = true
  try {
    const entries = await listQueue()
    for (const entry of entries) {
      if (entry.fatal) continue
      try {
        await executeOp(entry.op)
        await dequeue(entry.id)
        emitCompleted({ kind: entry.op.kind, ticketId: opTicketId(entry.op) })
      } catch (err) {
        await handleFailure(entry, err)
        // Stop the drain on the first failure to avoid hammering the network
        // when we're in a flaky-connection window. The next change/online
        // tick will pick up where we left off.
        break
      }
    }
  } finally {
    running = false
  }
}

// ── Failure classification ──────────────────────────────────────────────────

/** Network-shaped failures we should retry. */
function isRetryable(err: unknown): boolean {
  if (err instanceof TypeError) return true // fetch() throws TypeError on offline
  // Supabase errors have a `status` numeric field for HTTP errors.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (err as any)?.status
  if (typeof status === 'number') {
    return status >= 500 || status === 408 || status === 429 || status === 0
  }
  // Fallback: messages that smell like network problems.
  const msg = String((err as Error)?.message ?? '').toLowerCase()
  return msg.includes('network') || msg.includes('failed to fetch') || msg.includes('timeout')
}

async function handleFailure(entry: QueueEntry, err: unknown): Promise<void> {
  const retryable = isRetryable(err)
  const nextAttempt = entry.attemptCount + 1
  const fatal = !retryable || nextAttempt >= MAX_ATTEMPTS
  await updateEntry(entry.id, {
    attemptCount: nextAttempt,
    lastError: stringifyError(err),
    lastAttemptAt: Date.now(),
    fatal,
  })
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function opTicketId(op: SyncOp): string | undefined {
  switch (op.kind) {
    case 'ticket_update':
    case 'ticket_submit':
    case 'photo_upload':
      return op.ticketId
    default:
      return undefined
  }
}

// ── Op execution ────────────────────────────────────────────────────────────
// These intentionally bypass the React Query mutations and call Supabase
// directly so the runner can operate without a React context.

async function executeOp(op: SyncOp): Promise<void> {
  switch (op.kind) {
    case 'ticket_create':
      return execTicketCreate(op)
    case 'ticket_update':
      return execTicketUpdate(op)
    case 'ticket_submit':
      return execTicketSubmit(op)
    case 'photo_upload':
      return execPhotoUpload(op)
  }
}

async function execTicketCreate(op: Extract<SyncOp, { kind: 'ticket_create' }>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ticketNumber, error: numErr } = await (supabase.rpc as any)(
    'next_ticket_number', { p_company_id: op.companyId }
  )
  if (numErr) throw numErr

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ticket, error: ticketErr } = await (supabase.from('tickets') as any)
    .insert({
      company_id: op.companyId,
      ticket_number: ticketNumber,
      customer_id: op.form.customer_id,
      requestor: op.form.requestor,
      job_number: op.form.job_number || null,
      job_location: op.form.job_location || null,
      job_problem: op.form.job_problem || null,
      ticket_type: op.form.ticket_type || null,
      work_date: op.form.work_date,
      work_description: op.form.work_description || null,
      equipment_enabled: op.form.equipment_enabled,
      status: 'draft',
      created_by: op.actorId,
    })
    .select()
    .single()
  if (ticketErr) throw ticketErr

  await insertChildRows(ticket.id, op.form)
}

async function execTicketUpdate(op: Extract<SyncOp, { kind: 'ticket_update' }>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('tickets') as any)
    .update({
      customer_id: op.form.customer_id,
      requestor: op.form.requestor,
      job_number: op.form.job_number || null,
      job_location: op.form.job_location || null,
      job_problem: op.form.job_problem || null,
      ticket_type: op.form.ticket_type || null,
      work_date: op.form.work_date,
      work_description: op.form.work_description || null,
      equipment_enabled: op.form.equipment_enabled,
    })
    .eq('id', op.ticketId)
  if (error) throw error

  // Replace children — same approach as the live useUpdateTicket hook.
  await Promise.all([
    supabase.from('ticket_materials').delete().eq('ticket_id', op.ticketId),
    supabase.from('ticket_labor').delete().eq('ticket_id', op.ticketId),
    supabase.from('ticket_vehicles').delete().eq('ticket_id', op.ticketId),
    supabase.from('ticket_equipment').delete().eq('ticket_id', op.ticketId),
  ])
  await insertChildRows(op.ticketId, op.form)
}

async function execTicketSubmit(op: Extract<SyncOp, { kind: 'ticket_submit' }>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('tickets') as any)
    .update({ status: 'submitted' })
    .eq('id', op.ticketId)
    .in('status', ['draft', 'returned'])
  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('ticket_audit_log') as any).insert({
    ticket_id: op.ticketId,
    actor_id: op.actorId,
    actor_name: op.actorName,
    action: 'submitted',
  })

  // Fire-and-forget admin notification. Failure here doesn't roll back the
  // submit; the queue runner only cares about the primary operation.
  void supabase.functions.invoke('notify-ticket-event', {
    body: { ticket_id: op.ticketId, event_kind: 'ticket_submitted' },
  })
}

async function execPhotoUpload(op: Extract<SyncOp, { kind: 'photo_upload' }>) {
  const ext = op.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
  const uuid = crypto.randomUUID()
  const path = `${op.companyId}/${op.ticketId}/${uuid}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('ticket-photos')
    .upload(path, op.blob, { contentType: op.mimeType, upsert: false })
  if (uploadErr) throw uploadErr

  const { error: insertErr } = await supabase
    .from('ticket_photos')
    .insert({
      ticket_id: op.ticketId,
      file_url: path,
      caption: op.caption || null,
      uploaded_by: op.actorId,
    })
  if (insertErr) {
    // Best-effort orphan cleanup, then propagate.
    await supabase.storage.from('ticket-photos').remove([path])
    throw insertErr
  }
}

// ── Child-row writer (mirrors hooks/useTickets saveChildRows) ───────────────

async function insertChildRows(ticketId: string, form: TicketFormDataLike) {
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
        })),
      ),
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
            start_time: isFlat ? null : (l.start_time || null),
            end_time: isFlat ? null : (l.end_time || null),
            hours: l.hours ?? null,
            reg_rate: l.reg_rate ?? null,
          }
        }),
      ),
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
        })),
      ),
    )
  }

  if (form.equipment.length) {
    inserts.push(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from('ticket_equipment') as any).insert(
        form.equipment.map(e => ({
          ticket_id: ticketId,
          sort_order: e.sort_order,
          equip_number: e.equip_number || null,
          hours: e.hours ?? null,
          rate: e.rate ?? null,
        })),
      ),
    )
  }

  const results = await Promise.all(inserts)
  for (const r of results) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = (r as any)?.error
    if (err) throw err
  }
}

// Local minimal shape so this file doesn't have to import the full TicketFormData
// type into runtime — the operations type-check via the SyncOp union.
type TicketFormDataLike = Extract<SyncOp, { kind: 'ticket_create' }>['form']
