import type { TicketFormData } from '@/hooks/useTickets'

/**
 * Diff a "before" ticket against an "after" ticket form state and produce
 * (a) a structured JSON diff for the audit log and (b) a human-readable
 * summary suitable for the re-sign reason field.
 *
 * Scope: top-level ticket fields are compared exactly; child collections
 * (materials/labor/vehicles/equipment) are compared at a coarse "row count
 * + per-row identity" level so we can tell the user "labor changed" without
 * dumping the entire payload as a reason. Labor row hours are tracked
 * specifically because they're the most common billing-relevant edit.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface FieldChange {
  before: unknown
  after: unknown
}

export interface ChildSummary {
  added: number
  removed: number
  modified: number
}

export interface TicketDiff {
  /** Top-level ticket fields that changed (e.g. work_date, requestor). */
  fields: Record<string, FieldChange>
  /** Coarse counts per child collection. */
  materials: ChildSummary
  labor: ChildSummary
  vehicles: ChildSummary
  equipment: ChildSummary
  /** Total labor-hours delta — useful in the reason text. */
  laborHoursDelta: number | null
}

export type Diffable = Pick<TicketFormData,
  | 'customer_id'
  | 'requestor'
  | 'job_number'
  | 'job_location'
  | 'job_problem'
  | 'ticket_type'
  | 'work_date'
  | 'work_description'
  | 'equipment_enabled'
  | 'materials'
  | 'labor'
  | 'vehicles'
  | 'equipment'
>

// ── Top-level field comparison ──────────────────────────────────────────────

const TICKET_FIELDS: { key: keyof Diffable; label: string }[] = [
  { key: 'customer_id', label: 'Customer' },
  { key: 'requestor', label: 'Requestor' },
  { key: 'job_number', label: 'Job number' },
  { key: 'job_location', label: 'Location' },
  { key: 'job_problem', label: 'Problem' },
  { key: 'ticket_type', label: 'Ticket type' },
  { key: 'work_date', label: 'Work date' },
  { key: 'work_description', label: 'Description' },
  { key: 'equipment_enabled', label: 'Equipment section' },
]

function normaliseScalar(v: unknown): unknown {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  return v
}

function diffFields(before: Diffable, after: Diffable): Record<string, FieldChange> {
  const out: Record<string, FieldChange> = {}
  for (const { key } of TICKET_FIELDS) {
    const a = normaliseScalar(before[key])
    const b = normaliseScalar(after[key])
    if (a !== b) {
      out[key as string] = { before: before[key], after: after[key] }
    }
  }
  return out
}

// ── Child-row comparison (id-based) ─────────────────────────────────────────

interface IdRow { id?: string }

/**
 * Compare two arrays of child rows where each row may carry an `id` (server-
 * persisted) or be brand-new. Returns counts of added / removed / modified
 * rows. Modified is best-effort: any persisted-id row whose JSON serialisation
 * differs counts as modified.
 */
function diffRows<T extends IdRow>(
  before: T[],
  after: T[],
  shouldIgnoreField?: (k: string) => boolean,
): ChildSummary {
  const beforeById = new Map(
    before.filter(r => r.id).map(r => [r.id!, r] as const),
  )
  const afterById = new Map(
    after.filter(r => r.id).map(r => [r.id!, r] as const),
  )
  let modified = 0
  let added = 0
  let removed = 0
  for (const [id, b] of afterById) {
    const a = beforeById.get(id)
    if (!a) {
      // Persisted id present in `after` but not `before` shouldn't happen,
      // but if it does treat as added rather than crash.
      added++
    } else if (!isShallowEqual(a, b, shouldIgnoreField)) {
      modified++
    }
  }
  for (const [id] of beforeById) {
    if (!afterById.has(id)) removed++
  }
  // Anything in `after` without an id is new.
  added += after.filter(r => !r.id).length
  return { added, removed, modified }
}

function isShallowEqual<T extends object>(
  a: T,
  b: T,
  shouldIgnoreField?: (k: string) => boolean,
): boolean {
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if (shouldIgnoreField?.(k)) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (normaliseScalar((a as any)[k]) !== normaliseScalar((b as any)[k])) return false
  }
  return true
}

// ── Top-level entry point ───────────────────────────────────────────────────

export function diffTicket(before: Diffable, after: Diffable): TicketDiff {
  const fields = diffFields(before, after)

  const materials = diffRows(before.materials, after.materials)
  // Labor: ignore reg_rate diffs that come from rate auto-fill so a customer
  // change (which retriggers reg_rate via the override map) doesn't look
  // like a meaningful tech edit on its own — we still count first_name,
  // hours, classification, etc. as material changes.
  const labor = diffRows(before.labor, after.labor)
  const vehicles = diffRows(before.vehicles, after.vehicles)
  const equipment = diffRows(before.equipment, after.equipment)

  // Hours delta across labor rows (best-effort; nulls treated as zero).
  const laborHoursBefore = before.labor.reduce((s, l) => s + (Number(l.hours) || 0), 0)
  const laborHoursAfter = after.labor.reduce((s, l) => s + (Number(l.hours) || 0), 0)
  const delta = laborHoursAfter - laborHoursBefore
  const laborHoursDelta = Math.abs(delta) > 1e-9 ? Number(delta.toFixed(2)) : null

  return { fields, materials, labor, vehicles, equipment, laborHoursDelta }
}

export function isMeaningfulDiff(d: TicketDiff): boolean {
  if (Object.keys(d.fields).length > 0) return true
  for (const c of [d.materials, d.labor, d.vehicles, d.equipment]) {
    if (c.added || c.removed || c.modified) return true
  }
  if (d.laborHoursDelta != null) return true
  return false
}

// ── Human-readable summary ──────────────────────────────────────────────────

function formatScalar(v: unknown): string {
  if (v == null) return '∅'
  if (v === '') return '∅'
  if (typeof v === 'boolean') return v ? 'on' : 'off'
  return String(v)
}

function summariseChild(name: string, c: ChildSummary): string | null {
  const parts: string[] = []
  if (c.added) parts.push(`${c.added} added`)
  if (c.removed) parts.push(`${c.removed} removed`)
  if (c.modified) parts.push(`${c.modified} modified`)
  if (parts.length === 0) return null
  return `${name} (${parts.join(', ')})`
}

/**
 * Produce a human-readable summary suitable for the audit log `note` field
 * and the re-sign reason auto-fill. Limited to the most relevant changes —
 * we don't dump every field, just the headlines.
 */
export function summariseDiff(d: TicketDiff): string {
  const parts: string[] = []

  for (const { key, label } of TICKET_FIELDS) {
    const change = d.fields[key as string]
    if (!change) continue
    parts.push(`${label}: ${formatScalar(change.before)} → ${formatScalar(change.after)}`)
  }

  for (const [name, summary] of [
    ['Labor', d.labor],
    ['Materials', d.materials],
    ['Vehicles', d.vehicles],
    ['Equipment', d.equipment],
  ] as const) {
    const s = summariseChild(name, summary)
    if (s) parts.push(s)
  }

  if (d.laborHoursDelta != null) {
    const sign = d.laborHoursDelta > 0 ? '+' : ''
    parts.push(`Labor hours ${sign}${d.laborHoursDelta}`)
  }

  return parts.join('; ')
}
