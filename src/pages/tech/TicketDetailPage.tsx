import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Send, RotateCcw, Clock, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useTicket, useSubmitTicket, useRequestReturn, useDeleteTicket } from '@/hooks/useTickets'
import { useAuth } from '@/contexts/AuthContext'
import { statusLabel, statusVariant } from '@/lib/ticketStatus'
import { formatTime } from '@/lib/timeUtils'
import { format, parseISO } from 'date-fns'

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, isAdmin } = useAuth()
  const { data: ticket, isLoading } = useTicket(id)
  const submitTicket = useSubmitTicket()
  const requestReturn = useRequestReturn()
  const deleteTicket = useDeleteTicket()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-60">
        <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!ticket) return <div className="p-6 text-muted-foreground">Ticket not found.</div>

  const t = ticket as unknown as {
    id: string; ticket_number: string; status: 'draft' | 'submitted' | 'returned' | 'finalized'
    work_date: string; ticket_type: string | null; requestor: string; job_number: string | null
    job_location: string | null; job_problem: string | null; work_description: string | null
    equipment_enabled: boolean; grand_total: number; has_post_finalize_changes: boolean
    created_by: string
    customers: { name: string }
    ticket_materials: { id: string; qty: number; part_number: string | null; description: string | null; price_each: number | null; total: number | null }[]
    ticket_labor: { id: string; first_name: string; last_name: string; classification_snapshot: string | null; start_time: string | null; end_time: string | null; hours: number | null; reg_rate: number | null; reg_total: number | null }[]
    ticket_vehicles: { id: string; vehicle_label: string | null; mileage_start: number | null; mileage_end: number | null; total_miles: number | null; rate: number | null; total: number | null }[]
    ticket_equipment: { id: string; equip_number: string | null; hours: number | null; rate: number | null; total: number | null }[]
    ticket_audit_log: { id: string; action: string; note: string | null; actor_name: string; created_at: string }[]
  }

  // Has the tech already requested a return on this submission?
  const hasRequestedReturn = (t.ticket_audit_log ?? []).some(e => e.action === 'return_requested')

  // Find the most recent 'returned' audit entry so we can show the admin's note
  const returnEntry = t.status === 'returned'
    ? [...(t.ticket_audit_log ?? [])].filter(e => e.action === 'returned').sort(
        (a, b) => {
          const ta = a.created_at ? parseISO(a.created_at).getTime() : 0
          const tb = b.created_at ? parseISO(b.created_at).getTime() : 0
          return tb - ta
        }
      )[0]
    : null

  const canEdit = (t.status === 'draft' || t.status === 'returned') && (t.created_by === profile?.id || isAdmin)
  const canSubmit = (t.status === 'draft' || t.status === 'returned') && t.created_by === profile?.id
  const canRequestReturn = t.status === 'submitted' && t.created_by === profile?.id
  const canDelete = t.status === 'draft' && t.created_by === profile?.id

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitTicket.mutateAsync(t.id)
      navigate('/tickets')
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRequestReturn() {
    setRequesting(true)
    setRequestError(null)
    try {
      await requestReturn.mutateAsync({ ticketId: t.id })
      navigate('/tickets')
    } catch (err: unknown) {
      setRequestError(err instanceof Error ? err.message : 'Failed to send request. Please try again.')
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/tickets')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{t.ticket_number}</h1>
            <Badge variant={statusVariant(t.status)}>{statusLabel(t.status)}</Badge>
            {t.has_post_finalize_changes && <Badge variant="warning">Changes since export</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{t.customers?.name}</p>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => navigate(`/tickets/${t.id}/edit`)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
      </div>

      {/* Returned banner */}
      {returnEntry && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800 px-4 py-3 flex gap-3">
          <TriangleAlert className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
              Returned by {returnEntry.actor_name}
            </p>
            {returnEntry.note ? (
              <p className="text-sm text-yellow-700 dark:text-yellow-400 whitespace-pre-wrap">{returnEntry.note}</p>
            ) : (
              <p className="text-sm text-yellow-600 dark:text-yellow-500 italic">No note provided.</p>
            )}
          </div>
        </div>
      )}

      {/* Job Info */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Job Information</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><p className="text-xs text-muted-foreground">Date</p><p>{format(new Date(t.work_date), 'MMMM d, yyyy')}</p></div>
          <div><p className="text-xs text-muted-foreground">Type</p><p>{t.ticket_type || '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Requestor</p><p>{t.requestor || '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Job #</p><p>{t.job_number || '—'}</p></div>
          <div className="col-span-2"><p className="text-xs text-muted-foreground">Location</p><p>{t.job_location || '—'}</p></div>
          <div className="col-span-2"><p className="text-xs text-muted-foreground">Problem</p><p>{t.job_problem || '—'}</p></div>
        </CardContent>
      </Card>

      {/* Work Description */}
      {t.work_description && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Description of Work Performed</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{t.work_description}</p>
          </CardContent>
        </Card>
      )}

      {/* Materials */}
      {t.ticket_materials.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Material</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {t.ticket_materials.map(m => (
              <div key={m.id} className="flex items-start justify-between text-sm gap-2 py-1 border-b last:border-0">
                <div className="flex gap-2 min-w-0">
                  <span className="text-muted-foreground shrink-0">{m.qty}×</span>
                  <div className="min-w-0">
                    {m.part_number && <span className="text-xs text-muted-foreground">{m.part_number} · </span>}
                    <span className="break-words">{m.description}</span>
                  </div>
                </div>
                {isAdmin && m.total != null && (
                  <span className="shrink-0 font-medium">${Number(m.total).toFixed(2)}</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Labor */}
      {t.ticket_labor.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Labor</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {t.ticket_labor.map(l => (
              <div key={l.id} className="rounded-md border px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{l.first_name} {l.last_name}</p>
                  {isAdmin && l.reg_total != null && (
                    <span className="text-sm font-medium">${Number(l.reg_total).toFixed(2)}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{l.classification_snapshot || '—'}</p>
                <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                  {l.start_time && <span><Clock className="h-3 w-3 inline mr-0.5" />{formatTime(l.start_time)} – {formatTime(l.end_time)}</span>}
                  {l.hours != null && <span>{l.hours.toFixed(2)} hrs</span>}
                  {isAdmin && l.reg_rate != null && <span>${Number(l.reg_rate).toFixed(2)}/hr</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Vehicles */}
      {t.ticket_vehicles.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Vehicles / Mileage</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {t.ticket_vehicles.map(v => (
              <div key={v.id} className="rounded-md border px-3 py-2 flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">{v.vehicle_label || 'Vehicle'}</p>
                  <p className="text-xs text-muted-foreground">
                    {v.mileage_start} → {v.mileage_end}
                    {v.total_miles != null && ` · ${v.total_miles} mi`}
                  </p>
                </div>
                {isAdmin && v.total != null && (
                  <span className="text-sm font-medium">${Number(v.total).toFixed(2)}</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Equipment */}
      {t.equipment_enabled && t.ticket_equipment.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Equipment</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {t.ticket_equipment.map(e => (
              <div key={e.id} className="flex items-center justify-between text-sm border-b last:border-0 py-1">
                <span>{e.equip_number || '—'}</span>
                <span className="text-muted-foreground">{e.hours != null ? `${e.hours} hrs` : '—'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Grand total (admin only) */}
      {isAdmin && Number(t.grand_total) > 0 && (
        <div className="flex justify-end">
          <div className="rounded-lg border px-5 py-3 text-right">
            <p className="text-xs text-muted-foreground">Grand Total</p>
            <p className="text-2xl font-bold">${Number(t.grand_total).toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="fixed bottom-0 left-0 right-0 md:relative md:bottom-auto border-t md:border-0 bg-background p-4 md:p-0 flex flex-col gap-2 z-10">
        {submitError && (
          <p className="text-sm text-destructive text-center">{submitError}</p>
        )}
        {requestError && (
          <p className="text-sm text-destructive text-center">{requestError}</p>
        )}
        <div className="flex gap-3">
          {canDelete && (
            <Button variant="ghost" className="gap-2 text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
          {canSubmit && (
            <Button className="flex-1 gap-2" onClick={handleSubmit} disabled={submitting}>
              <Send className="h-4 w-4" />
              {submitting ? 'Submitting…' : 'Submit for Review'}
            </Button>
          )}
          {canRequestReturn && (
            hasRequestedReturn ? (
              <div className="flex-1 flex items-center justify-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 px-4 py-2 text-sm font-medium text-yellow-700 dark:text-yellow-400">
                <RotateCcw className="h-4 w-4" />
                Return Requested
              </div>
            ) : (
              <Button variant="outline" className="flex-1 gap-2" onClick={handleRequestReturn} disabled={requesting}>
                <RotateCcw className="h-4 w-4" />
                {requesting ? 'Requesting…' : 'Request Return'}
              </Button>
            )
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Ticket</DialogTitle>
            <DialogDescription>
              Permanently delete <strong>{t.ticket_number}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteTicket.isPending}
              onClick={async () => {
                await deleteTicket.mutateAsync(t.id)
                navigate('/tickets', { replace: true })
              }}
            >
              {deleteTicket.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
