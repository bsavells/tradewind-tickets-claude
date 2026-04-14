import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardList, Search, ChevronRight, FileText, RefreshCw, FileDown, RotateCcw, CheckCircle, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useAllTickets, useReturnTicket, useFinalizeTicket, useDeleteTicket } from '@/hooks/useTickets'
import { exportTicketPdf, type ExportTicketData } from '@/lib/exportTicketPdf'
import { statusLabel, statusVariant } from '@/lib/ticketStatus'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Database } from '@/lib/database.types'

type TicketStatus = Database['public']['Tables']['tickets']['Row']['status']

const STATUS_FILTERS: { value: TicketStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'submitted', label: 'Pending Review' },
  { value: 'finalized', label: 'Finalized' },
  { value: 'draft', label: 'Drafts' },
  { value: 'returned', label: 'Returned' },
]

const VALID_STATUSES: (TicketStatus | 'all')[] = ['all', 'submitted', 'finalized', 'draft', 'returned']

export function AdminTicketsPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isWritableAdmin = profile?.role === 'admin' && !profile?.is_readonly_admin

  const [searchParams] = useSearchParams()
  const paramStatus = searchParams.get('status') as TicketStatus | 'all' | null
  const initialStatus: TicketStatus | 'all' = paramStatus && VALID_STATUSES.includes(paramStatus) ? paramStatus : 'all'
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>(initialStatus)
  const [search, setSearch] = useState('')
  const [hasUpdates, setHasUpdates] = useState(false)
  const [confirmReturn, setConfirmReturn] = useState<{ id: string; number: string } | null>(null)
  const [confirmFinalize, setConfirmFinalize] = useState<{ id: string; number: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; number: string } | null>(null)
  const [exportingPdfIds, setExportingPdfIds] = useState<Set<string>>(new Set())

  const { data: tickets = [], isLoading, refetch, isFetching } = useAllTickets(
    statusFilter === 'all' ? undefined : statusFilter
  )
  const returnTicket = useReturnTicket()
  const finalizeTicket = useFinalizeTicket()
  const deleteTicket = useDeleteTicket()

  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  function handleRefresh() {
    refetchRef.current()
    setHasUpdates(false)
  }

  async function handleExportPdf(e: React.MouseEvent, ticketId: string) {
    e.stopPropagation()
    setExportingPdfIds(prev => new Set(prev).add(ticketId))
    try {
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
        .eq('id', ticketId)
        .single()
      if (!error && data) {
        exportTicketPdf(data as unknown as ExportTicketData)
      }
    } finally {
      setExportingPdfIds(prev => { const s = new Set(prev); s.delete(ticketId); return s })
    }
  }

  async function handleConfirmReturn() {
    if (!confirmReturn) return
    await returnTicket.mutateAsync({ ticketId: confirmReturn.id })
    setConfirmReturn(null)
  }

  async function handleConfirmFinalize() {
    if (!confirmFinalize) return
    await finalizeTicket.mutateAsync(confirmFinalize.id)
    setConfirmFinalize(null)
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    await deleteTicket.mutateAsync(confirmDelete.id)
    setConfirmDelete(null)
  }

  useEffect(() => {
    if (!profile?.id || !profile?.company_id) return

    function onEvent() {
      refetchRef.current()
    }

    const notifChannel = supabase
      .channel(`alltickets-notif:${profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${profile.id}`,
      }, onEvent)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') setHasUpdates(true)
      })

    const ticketChannel = supabase
      .channel(`alltickets-tickets:${profile.company_id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tickets',
        filter: `company_id=eq.${profile.company_id}`,
      }, onEvent)
      .subscribe()

    return () => {
      supabase.removeChannel(notifChannel)
      supabase.removeChannel(ticketChannel)
    }
  }, [profile?.id, profile?.company_id])

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">All Tickets</h1>
          <p className="text-muted-foreground text-sm">View, review, and finalize tickets</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0 mt-1" onClick={handleRefresh} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {hasUpdates && (
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2.5">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Ticket activity detected — this list may be out of date.
          </p>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline shrink-0 ml-4"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      )}

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
              const auditLog = (t as unknown as { ticket_audit_log: { action: string; occurred_at: string }[] }).ticket_audit_log ?? []
              const lastSubmittedTime = auditLog
                .filter(e => e.action === 'submitted')
                .reduce((max, e) => Math.max(max, e.occurred_at ? new Date(e.occurred_at).getTime() : 0), 0)
              const returnRequested = t.status === 'submitted' && auditLog.some(
                e => e.action === 'return_requested' && (e.occurred_at ? new Date(e.occurred_at).getTime() : 0) > lastSubmittedTime
              )
              const isExportingPdf = exportingPdfIds.has(t.id)

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
                  <div className="flex items-center gap-2 shrink-0">
                    {Number(t.grand_total) > 0 && (
                      <span className="text-sm font-semibold tabular-nums">
                        ${Number(t.grand_total).toFixed(2)}
                      </span>
                    )}
                    {t.status === 'finalized' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-xs"
                        disabled={isExportingPdf}
                        onClick={e => handleExportPdf(e, t.id)}
                      >
                        {isExportingPdf
                          ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          : <FileDown className="h-3 w-3" />}
                        PDF
                      </Button>
                    )}
                    {t.status === 'returned' && isWritableAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
                        onClick={e => { e.stopPropagation(); setConfirmDelete({ id: t.id, number: t.ticket_number }) }}
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </Button>
                    )}
                    {t.status !== 'finalized' && t.status !== 'returned' && isWritableAdmin && Number(t.grand_total) > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-xs"
                        onClick={e => { e.stopPropagation(); setConfirmFinalize({ id: t.id, number: t.ticket_number }) }}
                      >
                        <CheckCircle className="h-3 w-3" />
                        Finalize
                      </Button>
                    )}
                    {t.status !== 'finalized' && t.status !== 'returned' && isWritableAdmin && Number(t.grand_total) === 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-xs"
                        onClick={e => { e.stopPropagation(); setConfirmReturn({ id: t.id, number: t.ticket_number }) }}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Return
                      </Button>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Return confirmation dialog */}
      <Dialog open={!!confirmReturn} onOpenChange={v => { if (!v) setConfirmReturn(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Return Ticket</DialogTitle>
            <DialogDescription>
              Return <strong>{confirmReturn?.number}</strong> to the technician for revision?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReturn(null)}>Cancel</Button>
            <Button onClick={handleConfirmReturn} disabled={returnTicket.isPending}>
              {returnTicket.isPending ? 'Returning…' : 'Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finalize confirmation dialog */}
      <Dialog open={!!confirmFinalize} onOpenChange={v => { if (!v) setConfirmFinalize(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Finalize Ticket</DialogTitle>
            <DialogDescription>
              Finalize <strong>{confirmFinalize?.number}</strong>? This will notify the technician and lock the ticket.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFinalize(null)}>Cancel</Button>
            <Button onClick={handleConfirmFinalize} disabled={finalizeTicket.isPending}>
              {finalizeTicket.isPending ? 'Finalizing…' : 'Finalize'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={v => { if (!v) setConfirmDelete(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Ticket</DialogTitle>
            <DialogDescription>
              Permanently delete <strong>{confirmDelete?.number}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteTicket.isPending}>
              {deleteTicket.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
