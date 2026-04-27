/**
 * Pure aggregation helpers for the Admin Reports page.
 *
 * Given the list of tickets (each with its labor rows) returned by
 * useReportTickets, these helpers compute the KPIs and groupings the
 * reports page renders.
 */
import {
  startOfWeek,
  endOfWeek,
  eachWeekOfInterval,
  format,
  parseISO,
} from 'date-fns'

// ── Types ─────────────────────────────────────────────────────────────────
export interface ReportLabor {
  user_id: string | null
  first_name: string
  last_name: string
  hours: number | null
  reg_hours: number | null
  ot_hours: number | null
}

export interface ReportTicket {
  id: string
  ticket_number: string
  status: 'draft' | 'submitted' | 'returned' | 'finalized'
  work_date: string
  grand_total: number
  customer_id: string
  created_by: string | null
  requestor: string
  customers: { name: string } | null
  profiles: { first_name: string; last_name: string } | null
  ticket_labor: ReportLabor[]
}

export interface Kpis {
  ticketCount: number
  grandTotal: number
  totalHours: number
  activeTechCount: number
}

export interface StatusMix {
  draft: number
  submitted: number
  returned: number
  finalized: number
}

export interface TechWeekRow {
  techKey: string
  techLabel: string
  weeklyHours: Record<string, number>   // weekKey → hours
  total: number
}

export interface HoursGrid {
  weekKeys: string[]                    // sorted ascending
  weekLabels: string[]                  // e.g. "Apr 14" — same length as weekKeys
  techRows: TechWeekRow[]               // sorted by total desc
  weekTotals: Record<string, number>    // weekKey → sum across all techs
  grandTotal: number
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Total hours for a single labor row, preferring the split values when set. */
export function rowHours(l: ReportLabor): number {
  const reg = l.reg_hours ?? 0
  const ot = l.ot_hours ?? 0
  if (reg + ot > 0) return reg + ot
  return l.hours ?? 0
}

/** Stable technician identity — user_id when present, else name pair. */
export function techKey(l: ReportLabor): string {
  return l.user_id ?? `name:${l.first_name}|${l.last_name}`
}

/** Human-readable technician label. */
export function techLabel(l: ReportLabor): string {
  return `${l.first_name} ${l.last_name}`.trim() || '(Unknown tech)'
}

/** Week key = Monday of the week, formatted as yyyy-MM-dd. Falls back to the raw string on parse failure. */
export function weekKey(workDate: string): string {
  try {
    return format(startOfWeek(parseISO(workDate), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  } catch {
    return workDate
  }
}

/** All Monday-of-week keys that fall inside [from, to], inclusive. */
export function weeksInRange(from: string, to: string): string[] {
  try {
    const interval = {
      start: parseISO(from),
      end: parseISO(to),
    }
    return eachWeekOfInterval(interval, { weekStartsOn: 1 }).map(d =>
      format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    )
  } catch {
    return []
  }
}

/** Human label for a week key: "Apr 14". */
export function formatWeekLabel(weekKeyStr: string): string {
  try {
    return format(parseISO(weekKeyStr), 'MMM d')
  } catch {
    return weekKeyStr
  }
}

/** End-of-week date for a week key, formatted (for tooltip). */
export function formatWeekRange(weekKeyStr: string): string {
  try {
    const start = parseISO(weekKeyStr)
    const end = endOfWeek(start, { weekStartsOn: 1 })
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`
  } catch {
    return weekKeyStr
  }
}

// ── Top-level aggregations ────────────────────────────────────────────────

export function computeKpis(tickets: ReportTicket[]): Kpis {
  let grandTotal = 0
  let totalHours = 0
  const techSet = new Set<string>()

  for (const t of tickets) {
    grandTotal += Number(t.grand_total ?? 0)
    for (const l of t.ticket_labor ?? []) {
      totalHours += rowHours(l)
      techSet.add(techKey(l))
    }
  }

  return {
    ticketCount: tickets.length,
    grandTotal,
    totalHours,
    activeTechCount: techSet.size,
  }
}

export function computeStatusMix(tickets: ReportTicket[]): StatusMix {
  const mix: StatusMix = { draft: 0, submitted: 0, returned: 0, finalized: 0 }
  for (const t of tickets) mix[t.status] = (mix[t.status] ?? 0) + 1
  return mix
}

/**
 * Build the Tech × Week grid.
 *
 * The week columns span the explicit `[dateFrom, dateTo]` range passed in so
 * the grid shape is stable even if some weeks in the range have no hours.
 */
export function buildHoursGrid(
  tickets: ReportTicket[],
  dateFrom: string,
  dateTo: string,
): HoursGrid {
  const weekKeys = weeksInRange(dateFrom, dateTo)
  const weekLabels = weekKeys.map(formatWeekLabel)

  // techKey → { label, weeklyHours[weekKey] }
  const techMap = new Map<string, { label: string; weeklyHours: Map<string, number> }>()
  const weekTotals: Record<string, number> = Object.fromEntries(weekKeys.map(w => [w, 0]))
  let grandTotal = 0

  for (const t of tickets) {
    const wk = weekKey(t.work_date)
    for (const l of t.ticket_labor ?? []) {
      const hrs = rowHours(l)
      if (hrs === 0) continue

      const key = techKey(l)
      let entry = techMap.get(key)
      if (!entry) {
        entry = { label: techLabel(l), weeklyHours: new Map() }
        techMap.set(key, entry)
      }
      entry.weeklyHours.set(wk, (entry.weeklyHours.get(wk) ?? 0) + hrs)

      if (weekTotals[wk] !== undefined) weekTotals[wk] += hrs
      grandTotal += hrs
    }
  }

  // Materialise + sort rows by total hours desc
  const techRows: TechWeekRow[] = Array.from(techMap.entries())
    .map(([techKey, { label, weeklyHours }]) => {
      const weekly: Record<string, number> = Object.fromEntries(weekKeys.map(w => [w, 0]))
      let total = 0
      for (const [wk, h] of weeklyHours) {
        // Only include weeks that are in the requested range (defensive —
        // ticket.work_date might fall slightly outside the column set).
        if (weekly[wk] !== undefined) {
          weekly[wk] = h
          total += h
        }
      }
      return { techKey, techLabel: label, weeklyHours: weekly, total }
    })
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total)

  return { weekKeys, weekLabels, techRows, weekTotals, grandTotal }
}

/** Format a number as USD currency. */
export function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Format hours with 1 decimal place, no trailing .0 for integers. */
export function formatHours(n: number): string {
  if (n === 0) return '0'
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1)
}
