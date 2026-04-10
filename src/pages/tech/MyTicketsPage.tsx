import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, ChevronRight, Send, Trash2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { useMyTickets, useSubmitTicket, useDeleteTicket } from '@/hooks/useTickets'
import { statusLabel, statusVariant } from '@/lib/ticketStatus'
import { format } from 'date-fns'
import type { Database } from '@/lib/database.types'

type Ticket = Database['public']['Tables']['tickets']['Row']

function TicketRow({
  ticket,
  customerName,
  onSelect,
  onSubmit,
  onDelete,
}: {
  ticket: Ticket
  customerName: string
  onSelect: () => void
  onSubmit: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const canSubmit = ticket.status === 'draft' || ticket.status === 'returned'
  const canDelete = ticket.status === 'draft'

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
          {ticket.has_post_finalize_changes && (
            <Badge variant="warning" className="text-xs h-4 px-1.5">Updated</Badge>
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
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: tickets = [], isLoading, refetch, isFetching } = useMyTickets()
  const submitTicket = useSubmitTicket()
  const deleteTicket = useDeleteTicket()
  const [, setSubmitting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Ticket | null>(null)

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
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button className="gap-2" onClick={() => navigate('/tickets/new')}>
            <Plus className="h-4 w-4" />
            New Ticket
          </Button>
        </div>
      </div>

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
