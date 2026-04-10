import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Search, ChevronRight, FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAllTickets } from '@/hooks/useTickets'
import { statusLabel, statusVariant } from '@/lib/ticketStatus'
import { format } from 'date-fns'
import type { Database } from '@/lib/database.types'

type TicketStatus = Database['public']['Tables']['tickets']['Row']['status']

const STATUS_FILTERS: { value: TicketStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'submitted', label: 'Pending Review' },
  { value: 'finalized', label: 'Finalized' },
  { value: 'draft', label: 'Drafts' },
  { value: 'returned', label: 'Returned' },
]

export function AdminTicketsPage() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('submitted')
  const [search, setSearch] = useState('')

  const { data: tickets = [], isLoading } = useAllTickets(
    statusFilter === 'all' ? undefined : statusFilter
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return tickets
    const q = search.toLowerCase()
    return tickets.filter(t => {
      const customer = (t as unknown as { customers: { name: string } }).customers?.name ?? ''
      const tech = (t as unknown as { profiles: { first_name: string; last_name: string } }).profiles
      const techName = tech ? `${tech.first_name} ${tech.last_name}` : ''
      return (
        t.ticket_number.toLowerCase().includes(q) ||
        customer.toLowerCase().includes(q) ||
        techName.toLowerCase().includes(q) ||
        (t.job_number ?? '').toLowerCase().includes(q) ||
        (t.job_location ?? '').toLowerCase().includes(q)
      )
    })
  }, [tickets, search])

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">All Tickets</h1>
        <p className="text-muted-foreground text-sm">View, review, and finalize tickets</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ticket #, customer, tech, or job…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <Button
              key={f.value}
              size="sm"
              variant={statusFilter === f.value ? 'default' : 'outline'}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <CardContent className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </CardContent>
        ) : filtered.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <ClipboardList className="h-10 w-10 opacity-30" />
            <p className="font-medium">No tickets found</p>
            <p className="text-sm">Try adjusting your filters.</p>
          </CardContent>
        ) : (
          <div>
            {filtered.map(t => {
              const customerName = (t as unknown as { customers: { name: string } }).customers?.name ?? '—'
              const tech = (t as unknown as { profiles: { first_name: string; last_name: string } | null }).profiles
              const techName = tech ? `${tech.first_name} ${tech.last_name}` : '—'
              const auditLog = (t as unknown as { ticket_audit_log: { action: string }[] }).ticket_audit_log ?? []
              const returnRequested = t.status === 'submitted' && auditLog.some(e => e.action === 'return_requested')
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 px-4 py-3.5 border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/tickets/${t.id}`)}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{t.ticket_number}</span>
                      <Badge variant={statusVariant(t.status)} className="text-xs h-4 px-1.5">
                        {statusLabel(t.status)}
                      </Badge>
                      {returnRequested && (
                        <Badge variant="warning" className="text-xs h-4 px-1.5">Return Requested</Badge>
                      )}
                      {t.has_post_finalize_changes && (
                        <Badge variant="warning" className="text-xs h-4 px-1.5">Updated</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {customerName} · {techName} · {format(new Date(t.work_date), 'MMM d, yyyy')}
                    </p>
                    {t.job_location && (
                      <p className="text-xs text-muted-foreground truncate">{t.job_location}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {Number(t.grand_total) > 0 && (
                      <span className="text-sm font-semibold tabular-nums">
                        ${Number(t.grand_total).toFixed(2)}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
