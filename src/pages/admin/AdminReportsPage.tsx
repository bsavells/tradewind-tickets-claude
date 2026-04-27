import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  startOfWeek,
  endOfWeek,
  subMonths,
  format,
  parseISO,
} from 'date-fns'
import { BarChart3, Users, Clock, DollarSign, ClipboardList, RotateCcw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { GradientBar } from '@/components/Branding'
import { MultiSelect, type MultiSelectOption } from '@/components/MultiSelect'
import { useCustomers } from '@/hooks/useCustomers'
import { useProfiles } from '@/hooks/useProfiles'
import { useReportTickets, type ReportFilters } from '@/hooks/useReports'
import {
  computeKpis,
  computeStatusMix,
  buildHoursGrid,
  formatCurrency,
  formatHours,
  formatWeekRange,
} from '@/lib/reportUtils'
import { statusLabel, statusVariant } from '@/lib/ticketStatus'
import { cn } from '@/lib/utils'

// ── Filter defaults + URL serialization ─────────────────────────────────────
const TODAY = () => format(new Date(), 'yyyy-MM-dd')
const DEFAULT_STATUSES = ['submitted', 'finalized']

function defaultFilters(): ReportFilters {
  return {
    dateFrom: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    dateTo: TODAY(),
    customerIds: [],
    techIds: [],
    statuses: DEFAULT_STATUSES,
    requestors: [],
  }
}

function filtersFromQuery(qs: URLSearchParams): ReportFilters {
  const d = defaultFilters()
  const from = qs.get('from'); if (from) d.dateFrom = from
  const to = qs.get('to');     if (to) d.dateTo = to
  const customers = qs.get('customers'); if (customers) d.customerIds = customers.split(',').filter(Boolean)
  const techs = qs.get('techs');         if (techs) d.techIds = techs.split(',').filter(Boolean)
  const status = qs.get('status')
  if (status) d.statuses = status.split(',').filter(Boolean)
  const requestors = qs.get('requestors')
  if (requestors) d.requestors = requestors.split('|').filter(Boolean)
  return d
}

function queryFromFilters(f: ReportFilters): string {
  const def = defaultFilters()
  const params: string[] = []
  if (f.dateFrom !== def.dateFrom) params.push(`from=${f.dateFrom}`)
  if (f.dateTo !== def.dateTo) params.push(`to=${f.dateTo}`)
  if (f.customerIds.length > 0) params.push(`customers=${f.customerIds.join(',')}`)
  if (f.techIds.length > 0) params.push(`techs=${f.techIds.join(',')}`)
  if (f.statuses.join(',') !== def.statuses.join(',')) params.push(`status=${f.statuses.join(',')}`)
  // Requestors are free-text and may contain commas, so use | as separator
  if (f.requestors.length > 0) params.push(`requestors=${f.requestors.map(encodeURIComponent).join('|')}`)
  return params.join('&')
}

// ── Date range presets ──────────────────────────────────────────────────────
const DATE_PRESETS = [
  {
    label: 'This Week',
    get: () => ({
      from: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      to: format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'This Month',
    get: () => ({
      from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
      to: TODAY(),
    }),
  },
  {
    label: 'Last Month',
    get: () => {
      const d = subMonths(new Date(), 1)
      return {
        from: format(startOfMonth(d), 'yyyy-MM-dd'),
        to: format(endOfMonth(d), 'yyyy-MM-dd'),
      }
    },
  },
  {
    label: 'This Quarter',
    get: () => ({
      from: format(startOfQuarter(new Date()), 'yyyy-MM-dd'),
      to: format(endOfQuarter(new Date()), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'YTD',
    get: () => ({
      from: format(startOfYear(new Date()), 'yyyy-MM-dd'),
      to: TODAY(),
    }),
  },
]

const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'finalized', label: 'Finalized' },
  { value: 'returned', label: 'Returned' },
  { value: 'draft', label: 'Draft' },
]

// ── Main page ───────────────────────────────────────────────────────────────
export function AdminReportsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = filtersFromQuery(searchParams)

  function updateFilters(next: Partial<ReportFilters>) {
    const merged = { ...filters, ...next }
    const qs = queryFromFilters(merged)
    setSearchParams(qs, { replace: true })
  }

  const { data: customers = [] } = useCustomers()
  const { data: profiles = [] } = useProfiles()
  const { data: tickets = [], isLoading, isError, error } = useReportTickets(filters)

  const customerOptions: MultiSelectOption[] = useMemo(
    () => customers.map(c => ({ value: c.id, label: c.name })),
    [customers],
  )
  const techOptions: MultiSelectOption[] = useMemo(
    () => profiles
      .filter(p => p.active)
      .map(p => ({ value: p.id, label: `${p.first_name} ${p.last_name}` })),
    [profiles],
  )

  // Requestor options come from the SQL-filtered ticket set so the dropdown
  // reflects the date/customer/tech/status scope that's currently selected.
  // Free-text values are de-duplicated case-insensitively and sorted A-Z.
  const requestorOptions: MultiSelectOption[] = useMemo(() => {
    const seen = new Map<string, string>() // key=lowercased, value=display
    for (const t of tickets) {
      const r = (t.requestor ?? '').trim()
      if (!r) continue
      const key = r.toLowerCase()
      if (!seen.has(key)) seen.set(key, r)
    }
    return Array.from(seen.values())
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map(name => ({ value: name, label: name }))
  }, [tickets])

  // Apply the requestor filter client-side so the available-requestor list
  // doesn't shrink to just the selected values.
  const filteredTickets = useMemo(() => {
    if (filters.requestors.length === 0) return tickets
    const targets = new Set(filters.requestors.map(r => r.toLowerCase()))
    return tickets.filter(t => targets.has((t.requestor ?? '').trim().toLowerCase()))
  }, [tickets, filters.requestors])

  const kpis = useMemo(() => computeKpis(filteredTickets), [filteredTickets])
  const statusMix = useMemo(() => computeStatusMix(filteredTickets), [filteredTickets])
  const hoursGrid = useMemo(
    () => buildHoursGrid(filteredTickets, filters.dateFrom, filters.dateTo),
    [filteredTickets, filters.dateFrom, filters.dateTo],
  )

  const hasFilters =
    filters.customerIds.length > 0 ||
    filters.techIds.length > 0 ||
    filters.requestors.length > 0 ||
    filters.statuses.join(',') !== DEFAULT_STATUSES.join(',') ||
    filters.dateFrom !== defaultFilters().dateFrom ||
    filters.dateTo !== defaultFilters().dateTo

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5 pb-16">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[var(--color-tw-blue)]" />
            <h1 className="text-2xl font-bold text-[var(--color-tw-navy)]">Reports</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Aggregate view of ticket activity. Filter by date range, customer, technician, or status.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[auto,1fr,1fr] gap-3 items-end">
            {/* Date range */}
            <div className="space-y-1.5">
              <Label className="tw-label">Date Range</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={e => updateFilters({ dateFrom: e.target.value })}
                  className="w-40"
                />
                <span className="text-muted-foreground text-xs">to</span>
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={e => updateFilters({ dateTo: e.target.value })}
                  className="w-40"
                />
              </div>
            </div>

            {/* Customers */}
            <div className="space-y-1.5">
              <Label className="tw-label">Customer</Label>
              <MultiSelect
                options={customerOptions}
                value={filters.customerIds}
                onChange={v => updateFilters({ customerIds: v })}
                placeholder="All customers"
              />
            </div>

            {/* Techs */}
            <div className="space-y-1.5">
              <Label className="tw-label">Technician</Label>
              <MultiSelect
                options={techOptions}
                value={filters.techIds}
                onChange={v => updateFilters({ techIds: v })}
                placeholder="All technicians"
              />
            </div>

            {/* Requestor — spans full row, options derived from current scope */}
            <div className="space-y-1.5 md:col-span-3">
              <Label className="tw-label">Requestor</Label>
              <MultiSelect
                options={requestorOptions}
                value={filters.requestors}
                onChange={v => updateFilters({ requestors: v })}
                placeholder={
                  requestorOptions.length === 0
                    ? 'No requestors in this date/customer range'
                    : 'All requestors'
                }
              />
            </div>
          </div>

          {/* Preset chips + status toggle */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="tw-label">Quick:</span>
            {DATE_PRESETS.map(p => {
              const preset = p.get()
              const active = filters.dateFrom === preset.from && filters.dateTo === preset.to
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => updateFilters({ dateFrom: preset.from, dateTo: preset.to })}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-md border transition-colors',
                    active
                      ? 'bg-[var(--color-tw-navy)] border-[var(--color-tw-navy)] text-white'
                      : 'bg-card hover:border-[var(--color-tw-blue)]/50',
                  )}
                >
                  {p.label}
                </button>
              )
            })}

            <span className="tw-label ml-3">Status:</span>
            {STATUS_OPTIONS.map(s => {
              const active = filters.statuses.includes(s.value)
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => {
                    const set = new Set(filters.statuses)
                    if (active) set.delete(s.value)
                    else set.add(s.value)
                    updateFilters({ statuses: Array.from(set) })
                  }}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-md border transition-colors',
                    active
                      ? 'bg-[var(--color-tw-blue)] border-[var(--color-tw-blue)] text-white'
                      : 'bg-card hover:border-[var(--color-tw-blue)]/50',
                  )}
                >
                  {s.label}
                </button>
              )
            })}

            {hasFilters && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive"
                onClick={() => setSearchParams('', { replace: true })}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loading / error states */}
      {isError && (
        <Card>
          <CardContent className="p-6 text-destructive">
            Failed to load report data: {error instanceof Error ? error.message : 'Unknown error'}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[var(--color-tw-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              icon={<ClipboardList className="h-4 w-4" />}
              label="Tickets"
              value={kpis.ticketCount.toLocaleString()}
            />
            <KpiCard
              icon={<DollarSign className="h-4 w-4" />}
              label="Grand Total"
              value={formatCurrency(kpis.grandTotal)}
            />
            <KpiCard
              icon={<Clock className="h-4 w-4" />}
              label="Total Hours"
              value={formatHours(kpis.totalHours)}
            />
            <KpiCard
              icon={<Users className="h-4 w-4" />}
              label="Active Techs"
              value={kpis.activeTechCount.toString()}
            />
          </div>

          {/* Status mix */}
          {kpis.ticketCount > 0 && (
            <Card>
              <CardContent className="p-4 flex flex-wrap items-center gap-2">
                <span className="tw-label mr-2">Status Mix</span>
                {(['submitted', 'finalized', 'returned', 'draft'] as const).map(s => {
                  const count = statusMix[s]
                  if (count === 0) return null
                  return (
                    <Badge key={s} variant={statusVariant(s)} className="gap-1.5">
                      <span className="font-bold tabular-nums">{count}</span>
                      <span className="font-normal">{statusLabel(s)}</span>
                    </Badge>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {/* Hours by tech × week grid */}
          <Card>
            <CardContent className="p-0">
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <h2 className="font-display font-bold text-[var(--color-tw-navy)]">Hours by Technician</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Weekly totals for each tech who logged time in the filtered range. Cells &gt; 40h are highlighted.
                  </p>
                </div>
              </div>

              {hoursGrid.techRows.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground italic">
                  No labor hours logged in this range.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[var(--color-tw-mist)]/40">
                        <th className="text-left font-semibold text-[var(--color-tw-navy)] p-3 sticky left-0 bg-[var(--color-tw-mist)]/40 z-10 min-w-[160px]">
                          Technician
                        </th>
                        {hoursGrid.weekKeys.map((wk, i) => (
                          <th
                            key={wk}
                            className="text-right font-semibold text-[var(--color-tw-navy)] p-3 tabular-nums"
                            title={formatWeekRange(wk)}
                          >
                            {hoursGrid.weekLabels[i]}
                          </th>
                        ))}
                        <th className="text-right font-bold text-[var(--color-tw-navy)] p-3 border-l">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {hoursGrid.techRows.map(row => (
                        <tr key={row.techKey} className="border-b last:border-0 hover:bg-[var(--color-tw-mist)]/30">
                          <td className="p-3 font-medium sticky left-0 bg-card hover:bg-[var(--color-tw-mist)]/30 z-10">
                            {row.techLabel}
                          </td>
                          {hoursGrid.weekKeys.map(wk => {
                            const h = row.weeklyHours[wk] ?? 0
                            const overtime = h > 40
                            return (
                              <td
                                key={wk}
                                className={cn(
                                  'p-3 text-right tabular-nums',
                                  h === 0 && 'text-muted-foreground/40',
                                  overtime && 'bg-red-50 text-red-700 font-semibold',
                                )}
                              >
                                {h === 0 ? '—' : formatHours(h)}
                              </td>
                            )
                          })}
                          <td className="p-3 text-right font-bold tabular-nums border-l text-[var(--color-tw-navy)]">
                            {formatHours(row.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {hoursGrid.techRows.length > 1 && (
                      <tfoot>
                        <tr className="border-t-2 border-[var(--color-tw-navy)]/20 bg-[var(--color-tw-mist)]/40">
                          <td className="p-3 font-bold text-[var(--color-tw-navy)] sticky left-0 bg-[var(--color-tw-mist)]/40 z-10">
                            Total
                          </td>
                          {hoursGrid.weekKeys.map(wk => (
                            <td key={wk} className="p-3 text-right tabular-nums font-bold text-[var(--color-tw-navy)]">
                              {formatHours(hoursGrid.weekTotals[wk] ?? 0)}
                            </td>
                          ))}
                          <td className="p-3 text-right font-extrabold tabular-nums border-l text-[var(--color-tw-navy)]">
                            {formatHours(hoursGrid.grandTotal)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Filtered ticket table */}
          <Card>
            <CardContent className="p-0">
              <div className="p-4 border-b">
                <h2 className="font-display font-bold text-[var(--color-tw-navy)]">
                  Tickets <span className="text-muted-foreground font-normal">({filteredTickets.length})</span>
                </h2>
              </div>

              {filteredTickets.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground italic">
                    No tickets match the current filters.
                  </p>
                  {hasFilters && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setSearchParams('', { replace: true })}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset filters
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ticket</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Requestor</TableHead>
                        <TableHead>Tech</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTickets.map(t => {
                        const hours = (t.ticket_labor ?? []).reduce((s, l) => {
                          const reg = l.reg_hours ?? 0
                          const ot = l.ot_hours ?? 0
                          return s + (reg + ot > 0 ? reg + ot : (l.hours ?? 0))
                        }, 0)
                        const techName = t.profiles
                          ? `${t.profiles.first_name} ${t.profiles.last_name}`
                          : '—'
                        let dateStr = '—'
                        try { dateStr = format(parseISO(t.work_date), 'MMM d, yyyy') } catch { /* ignore */ }
                        return (
                          <TableRow
                            key={t.id}
                            className="cursor-pointer hover:bg-[var(--color-tw-mist)]/40"
                            onClick={() => navigate(`/admin/tickets/${t.id}`)}
                          >
                            <TableCell className="font-medium">{t.ticket_number}</TableCell>
                            <TableCell className="text-muted-foreground">{dateStr}</TableCell>
                            <TableCell>{t.customers?.name ?? '—'}</TableCell>
                            <TableCell className="text-muted-foreground">{t.requestor || '—'}</TableCell>
                            <TableCell className="text-muted-foreground">{techName}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatHours(hours)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {formatCurrency(Number(t.grand_total ?? 0))}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(t.status)} className="text-xs">
                                {statusLabel(t.status)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// ── Small KPI card subcomponent ─────────────────────────────────────────────
function KpiCard({ icon, label, value }: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <Card className="overflow-hidden relative">
      <GradientBar thickness={2} />
      <CardContent className="p-4 pt-5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="text-[var(--color-tw-blue)]">{icon}</span>
          <span className="tw-label">{label}</span>
        </div>
        <p className="text-2xl font-extrabold text-[var(--color-tw-navy)] mt-1 tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
