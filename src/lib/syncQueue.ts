import { set, get, del, keys } from 'idb-keyval'
import type { TicketFormData } from '@/hooks/useTickets'

/**
 * Persistent retry queue for mutations that need the network.
 *
 * The runner ([syncRunner.ts](./syncRunner.ts)) drains this queue on every
 * `online` event and at app boot. Ops are stored in IndexedDB via
 * `idb-keyval` under a versioned prefix so we can enumerate without
 * maintaining a separate index.
 */

// ── Op types ─────────────────────────────────────────────────────────────────

export type SyncOp =
  | {
      kind: 'ticket_create'
      form: TicketFormData
      // Captured from the auth profile at enqueue time so the runner can
      // operate even if React/auth state is gone by then.
      companyId: string
      actorId: string
      actorName: string
    }
  | {
      kind: 'ticket_update'
      ticketId: string
      form: TicketFormData
    }
  | {
      kind: 'ticket_submit'
      ticketId: string
      actorId: string
      actorName: string
    }
  | {
      kind: 'photo_upload'
      ticketId: string
      // Stored as Blob — IDB serializes binary natively, no base64 round-trip.
      blob: Blob
      mimeType: string
      caption?: string
      companyId: string
      actorId: string
    }

export interface QueueEntry {
  id: string
  op: SyncOp
  attemptCount: number
  lastError: string | null
  enqueuedAt: number
  lastAttemptAt: number | null
  /** When true, the runner stops retrying — user must clear or fix manually. */
  fatal: boolean
}

const PREFIX = 'sync-queue-v1-'

function entryKey(id: string) {
  return `${PREFIX}${id}`
}

// ── Mutation API ─────────────────────────────────────────────────────────────

export async function enqueue(op: SyncOp): Promise<QueueEntry> {
  const entry: QueueEntry = {
    id: crypto.randomUUID(),
    op,
    attemptCount: 0,
    lastError: null,
    enqueuedAt: Date.now(),
    lastAttemptAt: null,
    fatal: false,
  }
  await set(entryKey(entry.id), entry)
  emitChange()
  return entry
}

export async function listQueue(): Promise<QueueEntry[]> {
  const allKeys = await keys()
  const queueKeys = (allKeys as string[]).filter(k => typeof k === 'string' && k.startsWith(PREFIX))
  const entries = await Promise.all(
    queueKeys.map(k => get<QueueEntry>(k).then(v => v ?? null)),
  )
  return entries
    .filter((e): e is QueueEntry => e !== null)
    .sort((a, b) => a.enqueuedAt - b.enqueuedAt)
}

export async function dequeue(id: string): Promise<void> {
  await del(entryKey(id))
  emitChange()
}

export async function updateEntry(
  id: string,
  patch: Partial<Pick<QueueEntry, 'attemptCount' | 'lastError' | 'lastAttemptAt' | 'fatal'>>,
): Promise<void> {
  const existing = await get<QueueEntry>(entryKey(id))
  if (!existing) return
  await set(entryKey(id), { ...existing, ...patch })
  emitChange()
}

export async function clearAll(): Promise<void> {
  const items = await listQueue()
  await Promise.all(items.map(e => del(entryKey(e.id))))
  emitChange()
}

// ── Change subscription ──────────────────────────────────────────────────────
// A tiny pub/sub so React hooks can re-read the queue when it mutates from
// anywhere (including the runner itself).

type Listener = () => void
const listeners = new Set<Listener>()

export function subscribeToQueueChanges(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function emitChange() {
  for (const fn of listeners) fn()
}
