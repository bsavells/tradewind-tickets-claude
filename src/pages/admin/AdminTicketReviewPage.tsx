import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, RotateCcw, Clock, Save, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  useTicket,
  useAdminUpdateTicketPricing,
  useFinalizeTicket,
  useUnfinalizeTicket,
  useReturnTicket,
  type AdminLineEdits,
} from '@/hooks/useTickets'
import { useAuth } from '@/contexts/AuthContext'
import { statusLabel, statusVariant } from '@/lib/ticketStatus'
import { formatTime } from '@/lib/timeUtils'
import { format } from 'date-fns'

interface MaterialRow {
  id: string
  qty: number
  part_number: string | null
  description: string | null
  price_each: number | null
  total: number | null
}

interface LaborRow {
  id: string
  first_name: string
  last_name: string
  classification_snapshot: string | null
  start_time: string | null
  end_time: string | null
  hours: number | null
  reg_hours: number | null
  ot_hours: number | null
  reg_rate: number | null
  ot_rate: number | null
  reg_total: number | null
  ot_total: number | null
  row_total: number | null
}

interface VehicleRow {
  id: string
  vehicle_label: string | null
  mileage_start: number | null
  mileage_end: number | null
  total_miles: number | null
  rate: number | null
  total: number | null
}

interface EquipmentRow {
  id: string
  equip_number: string | null
  hours: number | null
  rate: number | null
  total: number | null
}

interface TicketData {
  id: string
  ticket_number: string
  status: 'draft' | 'submitted' | 'returned' | 'finalized'
  work_date: string
  ticket_type: string | null
  requestor: string
  job_number: string | null
  job_location: string | null
  job_problem: string | null
  work_description: string | null
  equipment_enabled: boolean
  grand_total: number
  has_post_finalize_changes: boolean
  customers: { name: string }
  profiles: { first_name: string; last_name: string } | null
  ticket_materials: MaterialRow[]
  ticket_labor: LaborRow[]
  ticket_vehicles: VehicleRow[]
  ticket_equipment: EquipmentRow[]
}

function num(v: string): number | null {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function AdminTicketReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isWritableAdmin } = useAuth()
  const { data: rawTicket, isLoading } = useTicket(id)
  const updatePricing = useAdminUpdateTicketPricing()
  const finalize = useFinalizeTicket()
  const unfinalize = useUnfinalizeTicket()
  const returnTicket = useReturnTicket()

  const t = rawTicket as unknown as TicketData | undefined

  // Local editable state for pricing
  const [materials, setMaterials] = useState<MaterialRow[]>([])
  const [labor, setLabor] = useState<LaborRow[]>([])
  const [vehicles, setVehicles] = useState<VehicleRow[]>([])
  const [equipment, setEquipment] = useState<EquipmentRow[]>([])
  const [dirty, setDirty] = useState(false)

  const [returnOpen, setReturnOpen] = useState(false)
  const [returnNote, setReturnNote] = useState('')
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [unfinalizeOpen, setUnfinalizeOpen] = useState(false)

  useEffect(() => {
    if (!t) return
    setMaterials(t.ticket_materials.map(m => ({ ...m })))
    setLabor(t.ticket_labor.map(l => ({ ...l })))
    setVehicles(t.ticket_vehicles.map(v => ({ ...v })))
    setEquipment(t.ticket_equipment.map(e => ({ ...e })))
    setDirty(false)
  }, [t])

  // Live computed grand total reflecting unsaved changes
  const liveGrandTotal = useMemo(() => {
    let total = 0
    for (const m of materials) {
      if (m.price_each != null) total += Number(m.qty) * Number(m.price_each)
    }
    for (const l of labor) {
      const reg = (l.reg_rate ?? 0) * (l.reg_hours ?? 0)
      const ot = (l.ot_rate ?? 0) * (l.ot_hours ?? 0)
      total += reg + ot
    }
    for (const v of vehicles) {
      if (v.rate != null && v.mileage_start != null && v.mileage_end != null) {
        total += (v.mileage_end - v.mileage_start) * v.rate
      }
    }
    for (const e of equipment) {
      if (e.rate != null && e.hours != null) total += e.rate * e.hours
    }
    return total
  }, [materials, labor, vehicles, equipment])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-60">
        <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!t) return <div className="p-6 text-muted-foreground">Ticket not found.</div>

  const isFinalized = t.status === 'finalized'
  const canEdit = isWritableAdmin && !isFinalized
  const canFinalize = isWritableAdmin && (t.status === 'submitted')
  const canReturn = isWritableAdmin && t.status === 'submitted'
  const canUnfinalize = isWritableAdmin && isFinalized

  function updateMaterial(id: string, price: string) {
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, price_each: num(price) } : m))
    setDirty(true)
  }

  function updateLaborField(id: string, field: keyof LaborRow, value: string) {
    setLabor(prev => prev.map(l => {
      if (l.id !== id) return l
      const updated = { ...l, [field]: num(value) }
      // Auto-balance: if hours total set and reg_hours edited, ot_hours = hours - reg
      if (field === 'reg_hours' && l.hours != null) {
        const reg = num(value) ?? 0
        updated.ot_hours = Math.max(0, Number(l.hours) - reg)
      }
      if (field === 'ot_hours' && l.hours != null) {
        const ot = num(value) ?? 0
        updated.reg_hours = Math.max(0, Number(l.hours) - ot)
      }
      return updated
    }))
    setDirty(true)
  }

  function updateVehicle(id: string, rate: string) {
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, rate: num(rate) } : v))
    setDirty(true)
  }

  function updateEquipmentField(id: string, field: 'rate' | 'hours', value: string) {
    setEquipment(prev => prev.map(e => e.id === id ? { ...e, [field]: num(value) } : e))
    setDirty(true)
  }

  async function handleSavePricing() {
    const edits: AdminLineEdits = {
      materials: materials.map(m => ({ id: m.id, price_each: m.price_each })),
      labor: labor.map(l => ({
        id: l.id,
        reg_rate: l.reg_rate,
        ot_rate: l.ot_rate,
        reg_hours: l.reg_hours,
        ot_hours: l.ot_hours,
      })),
      vehicles: vehicles.map(v => ({ id: v.id, rate: v.rate })),
      equipment: equipment.map(e => ({ id: e.id, rate: e.rate, hours: e.hours })),
    }
    await updatePricing.mutateAsync({ ticketId: t!.id, edits })
    setDirty(false)
  }

  async function handleFinalize() {
    if (dirty) await handleSavePricing()
    await finalize.mutateAsync(t!.id)
    setFinalizeOpen(false)
  }

  async function handleUnfinalize() {
    await unfinalize.mutateAsync(t!.id)
    setUnfinalizeOpen(false)
  }

  async function handleReturn() {
    await returnTicket.mutateAsync({ ticketId: t!.id, note: returnNote || undefined })
    setReturnOpen(false)
    setReturnNote('')
    navigate('/admin/tickets')
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-5 pb-32">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/tickets')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{t.ticket_number}</h1>
            <Badge variant={statusVariant(t.status)}>{statusLabel(t.status)}</Badge>
            {t.has_post_finalize_changes && <Badge variant="warning">Changes since finalize</Badge>}
            {isFinalized && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground">
            {t.customers?.name}
            {t.profiles && ` · ${t.profiles.first_name} ${t.profiles.last_name}`}
          </p>
        </div>
      </div>

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

      {/* Description */}
      {t.work_description && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Description of Work Performed</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{t.work_description}</p>
          </CardContent>
        </Card>
      )}

      {/* Materials */}
      {materials.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Material</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {materials.map(m => {
              const lineTotal = m.price_each != null ? m.qty * m.price_each : null
              return (
                <div key={m.id} className="grid grid-cols-12 gap-2 items-center text-sm py-1 border-b last:border-0">
                  <div className="col-span-1 text-muted-foreground tabular-nums">{m.qty}×</div>
                  <div className="col-span-6 min-w-0">
                    {m.part_number && <span className="text-xs text-muted-foreground">{m.part_number} · </span>}
                    <span className="break-words">{m.description}</span>
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Price each"
                      className="h-8 text-right"
                      value={m.price_each ?? ''}
                      onChange={e => updateMaterial(m.id, e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="col-span-2 text-right font-medium tabular-nums">
                    {lineTotal != null ? `$${lineTotal.toFixed(2)}` : '—'}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Labor */}
      {labor.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Labor</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {labor.map(l => {
              const reg = (l.reg_rate ?? 0) * (l.reg_hours ?? 0)
              const ot = (l.ot_rate ?? 0) * (l.ot_hours ?? 0)
              const rowTotal = reg + ot
              return (
                <div key={l.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{l.first_name} {l.last_name}</p>
                      <p className="text-xs text-muted-foreground">{l.classification_snapshot || '—'}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">${rowTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {l.start_time && (
                      <span>
                        <Clock className="h-3 w-3 inline mr-0.5" />
                        {formatTime(l.start_time)} – {formatTime(l.end_time)}
                      </span>
                    )}
                    {l.hours != null && <span>Total: {Number(l.hours).toFixed(2)} hrs</span>}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <Label className="text-xs">Reg Hrs</Label>
                      <Input
                        type="number" step="0.25" className="h-8"
                        value={l.reg_hours ?? ''}
                        onChange={e => updateLaborField(l.id, 'reg_hours', e.target.value)}
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Reg Rate</Label>
                      <Input
                        type="number" step="0.01" className="h-8"
                        value={l.reg_rate ?? ''}
                        onChange={e => updateLaborField(l.id, 'reg_rate', e.target.value)}
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">OT Hrs</Label>
                      <Input
                        type="number" step="0.25" className="h-8"
                        value={l.ot_hours ?? ''}
                        onChange={e => updateLaborField(l.id, 'ot_hours', e.target.value)}
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">OT Rate</Label>
                      <Input
                        type="number" step="0.01" className="h-8"
                        value={l.ot_rate ?? ''}
                        onChange={e => updateLaborField(l.id, 'ot_rate', e.target.value)}
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Vehicles */}
      {vehicles.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Vehicles / Mileage</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {vehicles.map(v => {
              const miles = (v.mileage_end ?? 0) - (v.mileage_start ?? 0)
              const lineTotal = v.rate != null && v.mileage_start != null && v.mileage_end != null
                ? miles * v.rate : null
              return (
                <div key={v.id} className="grid grid-cols-12 gap-2 items-center text-sm py-1 border-b last:border-0">
                  <div className="col-span-5 min-w-0">
                    <p className="font-medium">{v.vehicle_label || 'Vehicle'}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.mileage_start} → {v.mileage_end} ({miles.toFixed(1)} mi)
                    </p>
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number" step="0.01" placeholder="Rate" className="h-8 text-right"
                      value={v.rate ?? ''}
                      onChange={e => updateVehicle(v.id, e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="col-span-4 text-right font-medium tabular-nums">
                    {lineTotal != null ? `$${lineTotal.toFixed(2)}` : '—'}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Equipment */}
      {t.equipment_enabled && equipment.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Equipment</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {equipment.map(e => {
              const lineTotal = e.rate != null && e.hours != null ? e.rate * e.hours : null
              return (
                <div key={e.id} className="grid grid-cols-12 gap-2 items-center text-sm py-1 border-b last:border-0">
                  <div className="col-span-4">{e.equip_number || '—'}</div>
                  <div className="col-span-3">
                    <Input
                      type="number" step="0.25" placeholder="Hours" className="h-8 text-right"
                      value={e.hours ?? ''}
                      onChange={ev => updateEquipmentField(e.id, 'hours', ev.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number" step="0.01" placeholder="Rate" className="h-8 text-right"
                      value={e.rate ?? ''}
                      onChange={ev => updateEquipmentField(e.id, 'rate', ev.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="col-span-2 text-right font-medium tabular-nums">
                    {lineTotal != null ? `$${lineTotal.toFixed(2)}` : '—'}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Grand total */}
      <div className="flex justify-end">
        <div className="rounded-lg border px-5 py-3 text-right">
          <p className="text-xs text-muted-foreground">
            Grand Total {dirty && <span className="text-warning">(unsaved)</span>}
          </p>
          <p className="text-3xl font-bold tabular-nums">${liveGrandTotal.toFixed(2)}</p>
        </div>
      </div>

      {/* Action bar */}
      <div className="fixed bottom-0 left-0 right-0 md:relative border-t md:border md:rounded-lg bg-background p-4 flex flex-wrap gap-2 z-10 md:shadow-sm">
        {canEdit && (
          <Button
            className="gap-2"
            variant={dirty ? 'default' : 'outline'}
            disabled={!dirty || updatePricing.isPending}
            onClick={handleSavePricing}
          >
            <Save className="h-4 w-4" />
            {updatePricing.isPending ? 'Saving…' : 'Save Pricing'}
          </Button>
        )}
        {canReturn && (
          <Button variant="outline" className="gap-2" onClick={() => setReturnOpen(true)}>
            <RotateCcw className="h-4 w-4" /> Return to Tech
          </Button>
        )}
        {canFinalize && (
          <Button className="gap-2 ml-auto" onClick={() => setFinalizeOpen(true)}>
            <Check className="h-4 w-4" /> Finalize
          </Button>
        )}
        {canUnfinalize && (
          <Button variant="outline" className="gap-2 ml-auto" onClick={() => setUnfinalizeOpen(true)}>
            <RotateCcw className="h-4 w-4" /> Unfinalize
          </Button>
        )}
      </div>

      {/* Return dialog */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Return to Tech</DialogTitle>
            <DialogDescription>
              The tech will be able to edit and resubmit this ticket. Add a note explaining what needs to change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea
              rows={4}
              value={returnNote}
              onChange={e => setReturnNote(e.target.value)}
              placeholder="e.g. Please add the missing part numbers for material lines 3 and 4."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>Cancel</Button>
            <Button onClick={handleReturn} disabled={returnTicket.isPending}>
              {returnTicket.isPending ? 'Returning…' : 'Return Ticket'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finalize confirm */}
      <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Finalize Ticket</DialogTitle>
            <DialogDescription>
              Locks the ticket for billing at <strong>${liveGrandTotal.toFixed(2)}</strong>.
              {dirty && ' Pricing changes will be saved first.'} You can unfinalize later if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizeOpen(false)}>Cancel</Button>
            <Button onClick={handleFinalize} disabled={finalize.isPending || updatePricing.isPending}>
              {finalize.isPending || updatePricing.isPending ? 'Finalizing…' : 'Finalize'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unfinalize confirm */}
      <Dialog open={unfinalizeOpen} onOpenChange={setUnfinalizeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Unfinalize Ticket</DialogTitle>
            <DialogDescription>
              Reverts this ticket to "Submitted" so pricing can be edited again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnfinalizeOpen(false)}>Cancel</Button>
            <Button onClick={handleUnfinalize} disabled={unfinalize.isPending}>
              {unfinalize.isPending ? 'Unfinalizing…' : 'Unfinalize'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
