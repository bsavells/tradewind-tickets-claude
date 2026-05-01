import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, ChevronRight, Send, Trash2, RefreshCw, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useMyTickets, useSubmitTicket, useDeleteTicket } from '@/hooks/useTickets'
import { statusLabel, statusVariant } from '@/lib/ticketStatus'
import { format } from 'date-fns'
import type { Database } from '@/lib/database.types'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

type Ticket = Database['public']['Tables']['tickets']['Row']

type AuditEntry = { action: string; occurred_at: string }

function TicketRow({
  ticket,
  customerName,
  auditLog,
  onSelect,
  onSubmit,
  onDelete,
}: {
  ticket: Ticket & { ticket_photos?: { id: string }[] }
  customerName: string
  auditLog: AuditEntry[]
  onSelect: () => void
  onSubmit: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const canSubmit = ticket.status === 'draft' || ticket.status === 'returned'
  const canDelete = ticket.status === 'draft'

  const lastSubmittedTime = auditLog
    .filter(e => e.action === 'submitted')
    .reduce((max, e) => Math.max(max, e.occurred_at ? new Date(e.occurred_at).getTime() : 0), 0)
  const returnRequested = ticket.status === 'submitted' && auditLog.some(
    e => e.action === 'return_requested' && (e.occurred_at ? new Date(e.occurred_at).getTime() : 0) > lastSubmittedTime
  )

  return (
    <div
      className="flex items-center gap-3 px-4 py-3.5 border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
      onClick={onSelect}
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{ticket.ticket_number}</span>
          <Badge variant={statusVariant(ticket.status)} className="text-xs h-4 px-1.5">
            {statusLabel(ticket.status)}
          </Badge>
          {returnRequested && (
            <Badge variant="warning" className="text-xs h-4 px-1.5">Return Requested</Badge>
          )}
          {ticket.has_post_finalize_changes && (
            <Badge variant="warning" className="text-xs h-4 px-1.5">Updated</Badge>
          )}
          {ticket.is_signed && (
            <Badge variant="outline" className="text-xs h-4 px-1.5 text-green-700 border-green-300 bg-green-50">
              Signed
            </Badge>
          )}
          {ticket.ticket_photos && ticket.ticket_photos.length > 0 && (
            <Badge
              variant="outline"
              className="text-xs h-4 px-1.5 gap-1 text-[var(--color-tw-blue)] border-blue-200 bg-blue-50"
              title={`${ticket.ticket_photos.length} photo${ticket.ticket_photos.length === 1 ? '' : 's'} attached`}
            >
              <ImageIcon className="h-2.5 w-2.5" />
              {ticket.ticket_photos.length}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {customerName} · {format(new Date(ticket.work_date), 'MMM d, yyyy')}
        </p>
        {ticket.job_location && (
          <p className="text-xs text-muted-foreground truncate">{ticket.job_location}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {canSubmit && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs hidden sm:flex"
            onClick={onSubmit}
          >
            <Send className="h-3 w-3" />
            Submit
          </Button>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="ghost"
            aria-label="Delete draft ticket"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  )
}

export function MyTicketsPage() {
  useDocumentTitle('My Tickets')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const { data: tickets = [], isLoading, refetch, isFetching } = useMyTickets()
  const submitTicket = useSubmitTicket()
  const deleteTicket = useDeleteTicket()
  const [, setSubmitting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Ticket | null>(null)
  const [hasUpdates, setHasUpdates] = useState(false)

  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  function handleRefresh() {
    refetchRef.current()
    setHasUpdates(false)
  }

  useEffect(() => {
    if (!profile?.id) return

    function onEvent() {
      refetchRef.current()
      // Also invalidate individual ticket detail caches so navigating into a
      // ticket after a status change (e.g. admin return) shows fresh data.
      qc.invalidateQueries({ queryKey: ['ticket'] })
    }

    // Notifications fire when an admin finalizes or returns a ticket
    const notifChannel = supabase
      .channel(`mytickets-notif:${profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${profile.id}`,
      }, onEvent)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') setHasUpdates(true)
      })

    // Direct ticket changes (requires tickets table in Realtime publication)
    const ticketChannel = supabase
      .channel(`mytickets-tickets:${profile.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tickets',
        filter: `created_by=eq.${profile.id}`,
      }, onEvent)
      .subscribe()

    return () => {
      supabase.removeChannel(notifChannel)
      supabase.removeChannel(ticketChannel)
    }
  }, [profile?.id])

  async function handleSubmit(e: React.MouseEvent, ticketId: string) {
    e.stopPropagation()
    setSubmitting(ticketId)
    try {
      await submitTicket.mutateAsync(ticketId)
    } finally {
      setSubmitting(null)
    }
  }

  function handleDeleteClick(e: React.MouseEvent, ticket: Ticket) {
    e.stopPropagation()
    setConfirmDelete(ticket)
  }

  async function confirmDeleteTicket() {
    if (!confirmDelete) return
    await deleteTicket.mutateAsync(confirmDelete.id)
    setConfirmDelete(null)
  }

  // Sort: drafts/returned first, then submitted, then finalized
  const sorted = [...tickets].sort((a, b) => {
    const order = { draft: 0, returned: 1, submitted: 2, finalized: 3 }
    return order[a.status] - order[b.status]
  })

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Tickets</h1>
          <p className="text-muted-foreground text-sm">
            Welcome back, {profile?.first_name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isFetching} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button className="gap-2" onClick={() => navigate('/tickets/new')}>
            <Plus className="h-4 w-4" />
            New Ticket
          </Button>
        </div>
      </div>

      {hasUpdates && (
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2.5">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Ticket activity detected — your list may be out of date.
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

      <Card className="overflow-hidden">
        {isLoading ? (
          <CardContent className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </CardContent>
        ) : sorted.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="font-medium">No tickets yet</p>
            <p className="text-sm">Tap "New Ticket" to get started.</p>
          </CardContent>
        ) : (
          <div>
            {sorted.map(t => (
              <TicketRow
                key={t.id}
                ticket={t}
                customerName={(t as unknown as { customers: { name: string } }).customers?.name ?? '—'}
                auditLog={(t as unknown as { ticket_audit_log: AuditEntry[] }).ticket_audit_log ?? []}
                onSelect={() => navigate(`/tickets/${t.id}`)}
                onSubmit={e => handleSubmit(e, t.id)}
                onDelete={e => handleDeleteClick(e, t)}
              />
            ))}
          </div>
        )}
      </Card>

      {sorted.some(t => t.status === 'draft' || t.status === 'returned') && (
        <p className="text-xs text-center text-muted-foreground">
          Tap a ticket to open it and submit, or use the Submit button on larger screens.
        </p>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={v => { if (!v) setConfirmDelete(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Ticket</DialogTitle>
            <DialogDescription>
              Permanently delete <strong>{confirmDelete?.ticket_number}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteTicket} disabled={deleteTicket.isPending}>
              {deleteTicket.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
