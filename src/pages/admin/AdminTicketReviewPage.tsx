import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, RotateCcw, Clock, Save, Lock, Trash2, TriangleAlert, FileDown, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  useTicket,
  useAdminUpdateTicketPricing,
  useFinalizeTicket,
  useUnfinalizeTicket,
  useReturnTicket,
  useDeleteTicket,
  useLogTicketExport,
  type AdminLineEdits,
} from '@/hooks/useTickets'
// Type-only import is erased at build time. The runtime jsPDF + autotable
// payload is loaded on demand inside the export handler.
import type { ExportTicketData } from '@/lib/exportTicketPdf'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PhotoUploader } from '@/components/PhotoUploader'
import { SignatureSection } from '@/components/SignatureSection'
import { TimeSelect } from '@/components/TimeSelect'
import { statusLabel, statusVariant } from '@/lib/ticketStatus'
import { formatTime, calcHours } from '@/lib/timeUtils'
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
  entry_mode: 'clock' | 'flat'
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
  ticket_signatures: { kind: string; signer_name: string | null; signed_at: string }[]
  ticket_audit_log: { id: string; action: string; note: string | null; actor_name: string; occurred_at: string }[]
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
  const deleteTicket = useDeleteTicket()
  const logExport = useLogTicketExport()

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
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [includePhotos, setIncludePhotos] = useState(true)

  useEffect(() => {
    if (!t) return
    setMaterials(t.ticket_materials.map(m => ({ ...m })))
    setLabor(t.ticket_labor.map(l => ({
      ...l,
      entry_mode: (l.entry_mode === 'flat' ? 'flat' : 'clock') as 'clock' | 'flat',
      start_time: l.start_time ? l.start_time.slice(0, 5) : l.start_time,
      end_time: l.end_time ? l.end_time.slice(0, 5) : l.end_time,
    })))
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
  const auditLog = t.ticket_audit_log ?? []
  const lastSubmittedTime = auditLog
    .filter(e => e.action === 'submitted')
    .reduce((max, e) => Math.max(max, e.occurred_at ? new Date(e.occurred_at).getTime() : 0), 0)
  const returnRequested = t.status === 'submitted' && auditLog.some(
    e => e.action === 'return_requested' && (e.occurred_at ? new Date(e.occurred_at).getTime() : 0) > lastSubmittedTime
  )
  const canEdit = isWritableAdmin && !isFinalized && t.status !== 'draft'

  // Pricing is "complete" when every line item has its price/rate set.
  // OT rates are only required when OT hours > 0.
  const pricingComplete =
    materials.every(m => m.price_each != null) &&
    labor.every(
      l =>
        (l.reg_hours == null || l.reg_hours === 0 || l.reg_rate != null) &&
        (l.ot_hours == null || l.ot_hours === 0 || l.ot_rate != null)
    ) &&
    vehicles.every(v => v.rate != null) &&
    equipment.every(e => e.rate != null)

  const canReturn = isWritableAdmin && t.status === 'submitted'
  const canUnfinalize = isWritableAdmin && isFinalized
  const canDelete = isWritableAdmin && !isFinalized
  const canExport = isWritableAdmin && t.status === 'finalized'

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

  function updateLaborTime(id: string, field: 'start_time' | 'end_time', value: string) {
    setLabor(prev => prev.map(l => {
      if (l.id !== id) return l
      const start = field === 'start_time' ? value : (l.start_time ?? '')
      const end = field === 'end_time' ? value : (l.end_time ?? '')
      const newHours = calcHours(start, end)
      return {
        ...l,
        [field]: value || null,
        hours: newHours,
      }
    }))
    setDirty(true)
  }

  function updateLaborMode(id: string, mode: 'clock' | 'flat') {
    setLabor(prev => prev.map(l => {
      if (l.id !== id) return l
      if (mode === 'flat') {
        // Switching to flat: keep hours so admin can edit, drop start/end.
        return { ...l, entry_mode: 'flat', start_time: null, end_time: null }
      }
      // Switching to clock: clear hours and reg/ot splits — admin must enter times next.
      return {
        ...l,
        entry_mode: 'clock',
        hours: null,
        reg_hours: null,
        ot_hours: null,
      }
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
        entry_mode: l.entry_mode,
        start_time: l.start_time,
        end_time: l.end_time,
        hours: l.hours,
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

  function openExportDialog() {
    setIncludePhotos(true) // default to including photos when they exist
    setExportOpen(true)
  }

  async function handleExportPdf() {
    if (!t) return
    setExportOpen(false)
    setExportingPdf(true)
    try {
      // Build export data — generate signed URLs for signatures
      const exportData = { ...(t as unknown as ExportTicketData) }
      const rawSigs = (t as unknown as { ticket_signatures?: { kind: string; signer_name: string | null; signed_at: string; image_url: string }[] }).ticket_signatures
      if (rawSigs && rawSigs.length > 0) {
        const sigsWithUrls = await Promise.all(
          rawSigs.map(async (sig) => {
            const { data: signed } = await supabase.storage
              .from('ticket-signatures')
              .createSignedUrl(sig.image_url, 120)
            return { ...sig, signedUrl: signed?.signedUrl }
          })
        )
        exportData.ticket_signatures = sigsWithUrls
      }

      // Photos — only fetch signed URLs if the admin opted to include them
      if (includePhotos) {
        const rawPhotos = (t as unknown as { ticket_photos?: { id: string; file_url: string; caption: string | null }[] }).ticket_photos
        if (rawPhotos && rawPhotos.length > 0) {
          const photosWithUrls = await Promise.all(
            rawPhotos.map(async (p) => {
              const { data: signed } = await supabase.storage
                .from('ticket-photos')
                .createSignedUrl(p.file_url, 300)
              return { ...p, signedUrl: signed?.signedUrl }
            })
          )
          exportData.ticket_photos = photosWithUrls
        }
      }

      const { exportTicketPdf } = await import('@/lib/exportTicketPdf')
      await exportTicketPdf(exportData, { includePhotos })
      await logExport.mutateAsync({ ticketId: t.id, format: 'pdf' })
    } finally {
      setExportingPdf(false)
    }
  }

  const photoCount =
    (t as unknown as { ticket_photos?: { id: string }[] }).ticket_photos?.length ?? 0

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
            {(t as unknown as { is_signed?: boolean }).is_signed && (
              <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                Signed
              </Badge>
            )}
            {(() => {
              const photoCount = (t as unknown as { ticket_photos?: { id: string }[] }).ticket_photos?.length ?? 0
              return photoCount > 0 ? (
                <Badge
                  variant="outline"
                  className="gap-1 text-[var(--color-tw-blue)] border-blue-200 bg-blue-50"
                  title={`${photoCount} photo${photoCount === 1 ? '' : 's'} attached`}
                >
                  <ImageIcon className="h-3 w-3" />
                  {photoCount}
                </Badge>
              ) : null
            })()}
            {returnRequested && (
              <Badge variant="warning" className="gap-1">
                <TriangleAlert className="h-3 w-3" /> Return Requested
              </Badge>
            )}
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
              const isFlat = l.entry_mode === 'flat'
              return (
                <div key={l.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{l.first_name} {l.last_name}</p>
                      <p className="text-xs text-muted-foreground">{l.classification_snapshot || '—'}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Label
                        htmlFor={`admin-labor-${l.id}-flat`}
                        className="text-xs font-normal text-muted-foreground cursor-pointer flex items-center gap-1.5"
                      >
                        Flat hours
                        <Switch
                          id={`admin-labor-${l.id}-flat`}
                          checked={isFlat}
                          disabled={!canEdit}
                          onCheckedChange={(checked) => updateLaborMode(l.id, checked ? 'flat' : 'clock')}
                        />
                      </Label>
                      <span className="text-sm font-semibold tabular-nums">${rowTotal.toFixed(2)}</span>
                    </div>
                  </div>
                  {isFlat ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                      <div className="sm:col-span-1">
                        <Label className="text-xs">Hours</Label>
                        <Input
                          type="number"
                          step="0.25"
                          min="0"
                          inputMode="decimal"
                          className="h-8"
                          value={l.hours ?? ''}
                          onChange={e => updateLaborField(l.id, 'hours', e.target.value)}
                          disabled={!canEdit}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
                      <div>
                        <Label className="text-xs">Start Time</Label>
                        <TimeSelect
                          value={l.start_time ?? ''}
                          onChange={v => updateLaborTime(l.id, 'start_time', v)}
                          disabled={!canEdit}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">End Time</Label>
                        <TimeSelect
                          value={l.end_time ?? ''}
                          onChange={v => updateLaborTime(l.id, 'end_time', v)}
                          disabled={!canEdit}
                          className="h-8"
                        />
                      </div>
                      <div className="text-xs text-muted-foreground self-center">
                        {l.start_time && l.end_time && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(l.start_time)} – {formatTime(l.end_time)}
                          </span>
                        )}
                        {l.hours != null && <span className="ml-2">Total: {Number(l.hours).toFixed(2)} hrs</span>}
                      </div>
                    </div>
                  )}
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

      {/* Customer Signature */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Customer Signature</CardTitle>
        </CardHeader>
        <CardContent>
          <SignatureSection ticketId={t.id} canEdit={true} />
        </CardContent>
      </Card>

      {/* Photos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Photos</CardTitle>
        </CardHeader>
        <CardContent>
          <PhotoUploader
            ticketId={t.id}
            canEdit={!isFinalized}
            onAutoSave={async () => t.id}
          />
        </CardContent>
      </Card>

      {/* Audit Log — always last, after signature + photos */}
      {auditLog.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Activity Log</CardTitle></CardHeader>
          <CardContent>
            <ol className="relative border-l border-border ml-2 space-y-4">
              {[...auditLog]
                .sort((a, b) => {
                  const da = a.occurred_at ? new Date(a.occurred_at).getTime() : 0
                  const db = b.occurred_at ? new Date(b.occurred_at).getTime() : 0
                  return da - db
                })
                .map((entry, i) => {
                  const label: Record<string, string> = {
                    submitted: 'Submitted for Review',
                    returned: 'Returned to User',
                    return_requested: 'Return Requested by User',
                    finalized: 'Finalized',
                    unfinalized: 'Unfinalized',
                    edited_by_admin: 'Pricing Updated',
                    exported: 'Exported',
                  }
                  const isRequest = entry.action === 'return_requested'
                  const parsedDate = entry.occurred_at ? new Date(entry.occurred_at) : null
                  const dateStr = parsedDate && !isNaN(parsedDate.getTime())
                    ? format(parsedDate, 'MMM d, yyyy h:mm a')
                    : '—'
                  return (
                    <li key={entry.id ?? i} className="ml-4">
                      <div className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background ${isRequest ? 'bg-yellow-500' : 'bg-primary'}`} />
                      <div className="flex flex-col gap-0.5">
                        <p className={`text-sm font-medium ${isRequest ? 'text-yellow-700 dark:text-yellow-400' : ''}`}>
                          {label[entry.action] ?? entry.action}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.actor_name} · {dateStr}
                        </p>
                        {entry.note && (
                          <p className="text-sm text-muted-foreground mt-0.5 italic">"{entry.note}"</p>
                        )}
                      </div>
                    </li>
                  )
                })}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Action bar */}
      <div className="fixed bottom-0 left-0 right-0 md:relative border-t md:border md:rounded-lg bg-background p-4 flex flex-wrap gap-2 z-10 md:shadow-sm">
        {canDelete && (
          <Button variant="ghost" className="gap-2 text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
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
            <RotateCcw className="h-4 w-4" /> Return to User
          </Button>
        )}
        {canExport && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={exportingPdf}
              onClick={openExportDialog}
            >
              {exportingPdf
                ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : <FileDown className="h-3.5 w-3.5" />}
              PDF
            </Button>
          </>
        )}
        {isWritableAdmin && t.status === 'submitted' && (
          <div className="ml-auto flex flex-col items-end gap-1">
            <Button
              className="gap-2"
              onClick={() => setFinalizeOpen(true)}
              disabled={!pricingComplete}
              title={pricingComplete ? undefined : 'Add pricing to all line items before finalizing'}
            >
              <Check className="h-4 w-4" /> Finalize
            </Button>
            {!pricingComplete && (
              <p className="text-xs text-muted-foreground">
                Add pricing to all line items before finalizing.
              </p>
            )}
          </div>
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
            <DialogTitle>Return to User</DialogTitle>
            <DialogDescription>
              The user will be able to edit and resubmit this ticket. Add a note explaining what needs to change.
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

      {/* Export PDF options */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Export PDF</DialogTitle>
            <DialogDescription>
              Generate a PDF of this ticket for sharing or printing.
            </DialogDescription>
          </DialogHeader>

          {photoCount > 0 ? (
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-[var(--color-tw-blue)]" />
                  <Label htmlFor="include-photos" className="text-sm font-medium cursor-pointer">
                    Include photos
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Append {photoCount} photo{photoCount === 1 ? '' : 's'} as additional page{photoCount === 1 ? '' : 's'}.
                </p>
              </div>
              <Switch
                id="include-photos"
                checked={includePhotos}
                onCheckedChange={setIncludePhotos}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No photos are attached to this ticket.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExportPdf} className="gap-2">
              <FileDown className="h-4 w-4" />
              Export PDF
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

      {/* Delete confirm */}
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
                navigate('/admin/tickets')
              }}
            >
              {deleteTicket.isPending ? 'Deleting…' : 'Delete'}
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
