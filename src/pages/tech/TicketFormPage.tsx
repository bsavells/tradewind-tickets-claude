import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Save, ArrowLeft, Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useCustomers } from '@/hooks/useCustomers'
import { useClassifications } from '@/hooks/useClassifications'
import { useVehicles } from '@/hooks/useVehicles'
import { useCreateTicket, useUpdateTicket, useTicket } from '@/hooks/useTickets'
import { useDraftAutosave, loadDraft, clearDraft } from '@/hooks/useDraftAutosave'
import { calcHours, todayISO } from '@/lib/timeUtils'
import type { TicketFormData } from '@/hooks/useTickets'
import { cn } from '@/lib/utils'

// ---- Schema ----
const materialSchema = z.object({
  id: z.string().optional(),
  sort_order: z.number(),
  qty: z.preprocess(v => parseFloat(String(v)), z.number().min(0.01)),
  part_number: z.string().optional().default(''),
  description: z.string().optional().default(''),
})

const laborSchema = z.object({
  id: z.string().optional(),
  sort_order: z.number(),
  user_id: z.string().nullable().default(null),
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  classification_snapshot: z.string().optional().default(''),
  start_time: z.string().optional().default(''),
  end_time: z.string().optional().default(''),
  hours: z.number().nullable().default(null),
  reg_rate: z.number().nullable().default(null),
})

const vehicleSchema = z.object({
  id: z.string().optional(),
  sort_order: z.number(),
  vehicle_id: z.string().nullable().default(null),
  vehicle_label: z.string().optional().default(''),
  mileage_start: z.preprocess(
    v => (v === '' || v == null ? null : parseFloat(String(v))),
    z.number().nullable()
  ),
  mileage_end: z.preprocess(
    v => (v === '' || v == null ? null : parseFloat(String(v))),
    z.number().nullable()
  ),
  rate: z.number().nullable().default(null),
})

const equipmentSchema = z.object({
  id: z.string().optional(),
  sort_order: z.number(),
  equip_number: z.string().optional().default(''),
  hours: z.preprocess(
    v => (v === '' || v == null ? null : parseFloat(String(v))),
    z.number().nullable()
  ),
  rate: z.number().nullable().default(null),
})

const ticketSchema = z.object({
  customer_id: z.string().min(1, 'Select a customer'),
  requestor: z.string().optional().default(''),
  job_number: z.string().optional().default(''),
  job_location: z.string().optional().default(''),
  job_problem: z.string().optional().default(''),
  ticket_type: z.string().optional().default(''),
  work_date: z.string().min(1, 'Date is required'),
  work_description: z.string().optional().default(''),
  equipment_enabled: z.boolean().default(false),
  materials: z.array(materialSchema),
  labor: z.array(laborSchema),
  vehicles: z.array(vehicleSchema),
  equipment: z.array(equipmentSchema),
})

type FormValues = z.infer<typeof ticketSchema>

// ---- Section wrapper ----
function Section({
  title, children, action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

// ---- 15-minute time select ----
const TIME_OPTIONS: { value: string; label: string }[] = []
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    const hh = String(h).padStart(2, '0')
    const mm = String(m).padStart(2, '0')
    const period = h >= 12 ? 'PM' : 'AM'
    const hour12 = h % 12 || 12
    TIME_OPTIONS.push({ value: `${hh}:${mm}`, label: `${hour12}:${mm} ${period}` })
  }
}

function TimeSelect({
  value, onChange, disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-9">
        <SelectValue placeholder="--:-- --" />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {TIME_OPTIONS.map(o => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ---- Row delete button ----
function DeleteRowBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}

// ---- Main component ----
export function TicketFormPage() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = !!id
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: customers = [], isLoading: customersLoading } = useCustomers()
  const { data: classifications = [], isLoading: classificationsLoading } = useClassifications()
  const { data: vehicles = [] } = useVehicles()
  const { data: existingTicket, isLoading: ticketLoading } = useTicket(id)
  const createTicket = useCreateTicket()
  const updateTicket = useUpdateTicket()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [draftRestored, setDraftRestored] = useState(false)
  const [contactPickerKey, setContactPickerKey] = useState(0)
  const draftId = id ?? 'new'

  // Default labor row from current user's profile
  const defaultLaborRow = useCallback(() => ({
    sort_order: 0,
    user_id: profile?.id ?? null,
    first_name: profile?.first_name ?? '',
    last_name: profile?.last_name ?? '',
    classification_snapshot: (classifications as { id: string; name: string }[]).find(
      c => c.id === profile?.classification_id
    )?.name ?? '',
    start_time: '',
    end_time: '',
    hours: null,
    reg_rate: null,
  }), [profile, classifications])

  const { register, control, handleSubmit, watch, setValue, getValues, reset, formState: { errors } } =
    useForm<FormValues>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolver: zodResolver(ticketSchema) as any,
      defaultValues: {
        customer_id: '',
        requestor: '',
        job_number: '',
        job_location: '',
        job_problem: '',
        ticket_type: '',
        work_date: todayISO(),
        work_description: '',
        equipment_enabled: false,
        materials: [{ sort_order: 0, qty: 1, part_number: '', description: '' }],
        labor: [],
        vehicles: [],
        equipment: [],
      },
    })

  // Field arrays
  const materials = useFieldArray({ control, name: 'materials' })
  const labor = useFieldArray({ control, name: 'labor' })
  const vehicleFields = useFieldArray({ control, name: 'vehicles' })
  const equipment = useFieldArray({ control, name: 'equipment' })

  // Watched values for live calculations
  const watchedLabor = useWatch({ control, name: 'labor' })
  const watchedVehicles = useWatch({ control, name: 'vehicles' })
  const equipmentEnabled = useWatch({ control, name: 'equipment_enabled' })

  // Populate from existing ticket (edit mode)
  useEffect(() => {
    if (!existingTicket) return
    const t = existingTicket as unknown as {
      customer_id: string; requestor: string; job_number: string | null
      job_location: string | null; job_problem: string | null; ticket_type: string | null
      work_date: string; work_description: string | null; equipment_enabled: boolean
      ticket_materials: { id: string; sort_order: number; qty: number; part_number: string | null; description: string | null }[]
      ticket_labor: { id: string; sort_order: number; user_id: string | null; first_name: string; last_name: string; classification_snapshot: string | null; start_time: string | null; end_time: string | null; hours: number | null; reg_rate: number | null }[]
      ticket_vehicles: { id: string; sort_order: number; vehicle_id: string | null; vehicle_label: string | null; mileage_start: number | null; mileage_end: number | null; rate: number | null }[]
      ticket_equipment: { id: string; sort_order: number; equip_number: string | null; hours: number | null; rate: number | null }[]
    }
    reset({
      customer_id: t.customer_id,
      requestor: t.requestor,
      job_number: t.job_number ?? '',
      job_location: t.job_location ?? '',
      job_problem: t.job_problem ?? '',
      ticket_type: t.ticket_type ?? '',
      work_date: t.work_date,
      work_description: t.work_description ?? '',
      equipment_enabled: t.equipment_enabled,
      materials: t.ticket_materials.length
        ? t.ticket_materials.map(m => ({ ...m, part_number: m.part_number ?? '', description: m.description ?? '' }))
        : [{ sort_order: 0, qty: 1, part_number: '', description: '' }],
      labor: t.ticket_labor.map(l => ({
        ...l,
        classification_snapshot: l.classification_snapshot ?? '',
        // Supabase returns time as "HH:MM:SS" — slice to "HH:MM" to match Select options
        start_time: l.start_time?.slice(0, 5) ?? '',
        end_time: l.end_time?.slice(0, 5) ?? '',
      })),
      vehicles: t.ticket_vehicles.map(v => ({
        ...v,
        vehicle_label: v.vehicle_label ?? '',
      })),
      equipment: t.ticket_equipment.map(e => ({
        ...e,
        equip_number: e.equip_number ?? '',
      })),
    })
  }, [existingTicket, reset])

  // Restore draft from IndexedDB on mount (new tickets only)
  useEffect(() => {
    if (isEdit || draftRestored) return
    loadDraft('new').then(draft => {
      if (draft) {
        setDraftRestored(true)
        reset({
          customer_id: draft.customer_id,
          requestor: draft.requestor,
          job_number: draft.job_number,
          job_location: draft.job_location,
          job_problem: draft.job_problem,
          ticket_type: draft.ticket_type,
          work_date: draft.work_date,
          work_description: draft.work_description,
          equipment_enabled: draft.equipment_enabled,
          materials: draft.materials.length ? draft.materials : [{ sort_order: 0, qty: 1, part_number: '', description: '' }],
          labor: draft.labor,
          vehicles: draft.vehicles,
          equipment: draft.equipment,
        })
      }
    })
  }, [isEdit, draftRestored, reset])

  // Add default labor row once profile + classifications are loaded (new tickets)
  useEffect(() => {
    if (isEdit) return
    if (!profile || !classifications.length) return
    const current = getValues('labor')
    if (current.length === 0) {
      labor.append(defaultLaborRow())
    }
  }, [profile, classifications]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave
  const watchedAll = watch()
  useDraftAutosave(draftId, watchedAll as unknown as TicketFormData)

  // Auto-calc hours when start/end change
  useEffect(() => {
    watchedLabor.forEach((row, i) => {
      const h = calcHours(row.start_time ?? '', row.end_time ?? '')
      if (h !== row.hours) setValue(`labor.${i}.hours`, h)
    })
  }, [watchedLabor.map(r => `${r.start_time}|${r.end_time}`).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-calc vehicle miles
  useEffect(() => {
    // vehicle totals just displayed — no extra field needed (total_miles is computed in DB)
  }, [watchedVehicles])

  async function onSubmit(values: FormValues) {
    setSaving(true)
    setSaveError(null)
    try {
      const data = values as unknown as TicketFormData
      if (isEdit && id) {
        await updateTicket.mutateAsync({ id, form: data })
      } else {
        const ticket = await createTicket.mutateAsync(data)
        await clearDraft('new')
        navigate(`/tickets/${ticket.id}`, { replace: true })
        return
      }
      navigate('/tickets')
    } catch (err: unknown) {
      console.error('[TicketFormPage] save error:', err)
      setSaveError(err instanceof Error ? err.message : 'Failed to save ticket. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const customerOptions = customers.filter(c => c.active)
  const classificationOptions = classifications.filter(c => c.active)
  const vehicleOptions = vehicles.filter(v => v.active)

  function addLaborRow() {
    labor.append({
      sort_order: labor.fields.length,
      user_id: null,
      first_name: '',
      last_name: '',
      classification_snapshot: '',
      start_time: '',
      end_time: '',
      hours: null,
      reg_rate: null,
    })
  }

  function addVehicleRow() {
    vehicleFields.append({
      sort_order: vehicleFields.fields.length,
      vehicle_id: null,
      vehicle_label: '',
      mileage_start: null,
      mileage_end: null,
      rate: null,
    })
  }

  function onVehicleSelect(index: number, vehicleId: string) {
    const v = vehicleOptions.find(v => v.id === vehicleId)
    if (v) {
      setValue(`vehicles.${index}.vehicle_id`, vehicleId)
      setValue(`vehicles.${index}.vehicle_label`, v.label)
      setValue(`vehicles.${index}.rate`, Number(v.default_mileage_rate))
    }
  }

  function onLaborClassification(index: number, classId: string) {
    const c = classificationOptions.find(c => c.id === classId)
    if (c) {
      setValue(`labor.${index}.classification_snapshot`, c.name)
      setValue(`labor.${index}.reg_rate`, Number(c.default_reg_rate))
    }
  }

  const pageTitle = isEdit ? `Edit Ticket${existingTicket ? ` · ${(existingTicket as unknown as { ticket_number: string }).ticket_number}` : ''}` : 'New Ticket'

  // In edit mode, hold off rendering the form until the ticket + reference
  // data are all loaded. This ensures Radix Select components receive their
  // correct initial value on first paint rather than needing a value-change
  // after mount (which Radix doesn't always reflect in the trigger label).
  if (isEdit && (ticketLoading || customersLoading || classificationsLoading || !existingTicket)) {
    return (
      <div className="flex justify-center items-center h-60">
        <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5 pb-20">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/tickets')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{pageTitle}</h1>
          {draftRestored && !isEdit && (
            <Badge variant="outline" className="text-xs mt-0.5">Draft restored</Badge>
          )}
        </div>
        <Button onClick={handleSubmit(onSubmit)} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {saveError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {saveError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {/* ---- Header ---- */}
        <Section title="Job Information">
          <div className="space-y-1.5">
            <Label>Customer *</Label>
            <Select
              value={watch('customer_id')}
              onValueChange={v => setValue('customer_id', v)}
            >
              <SelectTrigger className={cn(errors.customer_id && 'border-destructive')}>
                <SelectValue placeholder="Select customer…" />
              </SelectTrigger>
              <SelectContent>
                {customerOptions.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.customer_id && <p className="text-xs text-destructive">{errors.customer_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Requestor</Label>
              {(() => {
                const selectedCustomerId = watch('customer_id')
                const selectedCustomer = customerOptions.find(c => c.id === selectedCustomerId)
                const contacts = (selectedCustomer as unknown as { customer_contacts: { id: string; name: string; title: string | null }[] } | undefined)?.customer_contacts ?? []
                return (
                  <div className="flex gap-1.5">
                    <Input
                      {...register('requestor')}
                      placeholder="Contact name"
                      className="flex-1"
                    />
                    {contacts.length > 0 && (
                      <Select
                        key={contactPickerKey}
                        onValueChange={name => {
                          setValue('requestor', name, { shouldDirty: true })
                          setContactPickerKey(k => k + 1)
                        }}
                      >
                        <SelectTrigger className="w-auto shrink-0 gap-1 px-2.5 text-xs">
                          <SelectValue placeholder="Contacts" />
                        </SelectTrigger>
                        <SelectContent>
                          {contacts.map(c => (
                            <SelectItem key={c.id} value={c.name}>
                              {c.name}{c.title ? ` — ${c.title}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )
              })()}
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" {...register('work_date')} />
              {errors.work_date && <p className="text-xs text-destructive">{errors.work_date.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Job #</Label>
              <Input {...register('job_number')} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Ticket Type</Label>
              <Input {...register('ticket_type')} placeholder="e.g. Service Call" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Job Location</Label>
            <Input {...register('job_location')} placeholder="Well name, pad, address…" />
          </div>

          <div className="space-y-1.5">
            <Label>Job Problem / Description</Label>
            <Input {...register('job_problem')} placeholder="Brief problem description" />
          </div>
        </Section>

        {/* ---- Description of work ---- */}
        <Section title="Description of Work Performed">
          <Textarea
            {...register('work_description')}
            placeholder="Describe what was done on site…"
            className="min-h-[120px]"
          />
        </Section>

        {/* ---- Materials ---- */}
        <Section
          title="Material"
          action={
            <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
              onClick={() => materials.append({ sort_order: materials.fields.length, qty: 1, part_number: '', description: '' })}>
              <Plus className="h-3 w-3" /> Add Row
            </Button>
          }
        >
          <div className="space-y-2">
            {/* Column headers — hidden on smallest screens */}
            <div className="hidden sm:grid grid-cols-[3rem_6rem_1fr_1.5rem] gap-2 text-xs text-muted-foreground px-1">
              <span>Qty</span><span>Part #</span><span>Description</span><span />
            </div>
            {materials.fields.map((field, i) => (
              <div key={field.id} className="grid grid-cols-[3rem_6rem_1fr_1.5rem] gap-2 items-start">
                <Input
                  type="number" step="0.01" min="0.01"
                  {...register(`materials.${i}.qty`)}
                  className="h-9 text-sm"
                  placeholder="1"
                />
                <Input
                  {...register(`materials.${i}.part_number`)}
                  className="h-9 text-sm"
                  placeholder="Optional"
                />
                <Input
                  {...register(`materials.${i}.description`)}
                  className="h-9 text-sm"
                  placeholder="Description"
                />
                <div className="flex items-center justify-center h-9">
                  <DeleteRowBtn
                    onClick={() => materials.remove(i)}
                    disabled={materials.fields.length === 1}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ---- Labor ---- */}
        <Section
          title="Labor"
          action={
            <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
              onClick={addLaborRow}>
              <Plus className="h-3 w-3" /> Add Row
            </Button>
          }
        >
          <div className="space-y-4">
            {labor.fields.map((field, i) => {
              const hours = watchedLabor[i]?.hours
              return (
                <div key={field.id} className="rounded-md border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Tech #{i + 1}</span>
                    <DeleteRowBtn onClick={() => labor.remove(i)} disabled={labor.fields.length === 1} />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">First Name *</Label>
                      <Input {...register(`labor.${i}.first_name`)} className="h-9" />
                      {errors.labor?.[i]?.first_name && (
                        <p className="text-xs text-destructive">{errors.labor[i]?.first_name?.message}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Last Name *</Label>
                      <Input {...register(`labor.${i}.last_name`)} className="h-9" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Classification</Label>
                    <Select
                      value={watch(`labor.${i}.classification_snapshot`) ?? ''}
                      onValueChange={v => {
                        const classId = classificationOptions.find(c => c.name === v)?.id
                        if (classId) onLaborClassification(i, classId)
                        else setValue(`labor.${i}.classification_snapshot`, v)
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {classificationOptions.map(c => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Start Time</Label>
                      <TimeSelect
                        value={watch(`labor.${i}.start_time`) ?? ''}
                        onChange={v => setValue(`labor.${i}.start_time`, v)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">End Time</Label>
                      <TimeSelect
                        value={watch(`labor.${i}.end_time`) ?? ''}
                        onChange={v => setValue(`labor.${i}.end_time`, v)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Hours</Label>
                      <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-sm font-medium">
                        {hours != null ? hours.toFixed(2) : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        {/* ---- Vehicles ---- */}
        <Section
          title="Vehicles / Mileage"
          action={
            <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
              onClick={addVehicleRow}>
              <Plus className="h-3 w-3" /> Add Vehicle
            </Button>
          }
        >
          {vehicleFields.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">No vehicles — tap "Add Vehicle" if mileage applies.</p>
          ) : (
            <div className="space-y-4">
              {vehicleFields.fields.map((field, i) => {
                const start = watchedVehicles[i]?.mileage_start
                const end = watchedVehicles[i]?.mileage_end
                const totalMiles = start != null && end != null ? Math.max(0, end - start) : null
                return (
                  <div key={field.id} className="rounded-md border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Vehicle #{i + 1}</span>
                      <DeleteRowBtn onClick={() => vehicleFields.remove(i)} />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Vehicle</Label>
                      <Select
                        value={watch(`vehicles.${i}.vehicle_id`) ?? 'none'}
                        onValueChange={v => v !== 'none' ? onVehicleSelect(i, v) : setValue(`vehicles.${i}.vehicle_id`, null)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select vehicle…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Other / unspecified</SelectItem>
                          {vehicleOptions.map(v => {
                            const detail = [v.year, v.make, v.model].filter(Boolean).join(' ')
                            return (
                              <SelectItem key={v.id} value={v.id}>
                                {v.label}{detail ? ` — ${detail}` : ''}
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-3 gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Start Mileage</Label>
                        <Input
                          type="number" min="0"
                          {...register(`vehicles.${i}.mileage_start`)}
                          className="h-9"
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">End Mileage</Label>
                        <Input
                          type="number" min="0"
                          {...register(`vehicles.${i}.mileage_end`)}
                          className="h-9"
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Total Miles</Label>
                        <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-sm font-medium">
                          {totalMiles != null ? totalMiles.toFixed(1) : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* ---- Equipment (optional) ---- */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Equipment</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Enable</span>
                <Switch
                  checked={equipmentEnabled}
                  onCheckedChange={v => {
                    setValue('equipment_enabled', v)
                    if (v && equipment.fields.length === 0) {
                      equipment.append({ sort_order: 0, equip_number: '', hours: null, rate: null })
                    }
                  }}
                />
              </div>
            </div>
          </CardHeader>
          {equipmentEnabled && (
            <CardContent className="space-y-3">
              <div className="hidden sm:grid grid-cols-[1fr_5rem_1.5rem] gap-2 text-xs text-muted-foreground px-1">
                <span>Equip #</span><span>Hours</span><span />
              </div>
              {equipment.fields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-[1fr_5rem_1.5rem] gap-2 items-start">
                  <Input
                    {...register(`equipment.${i}.equip_number`)}
                    className="h-9 text-sm"
                    placeholder="Equipment #"
                  />
                  <Input
                    type="number" step="0.5" min="0"
                    {...register(`equipment.${i}.hours`)}
                    className="h-9 text-sm"
                    placeholder="0"
                  />
                  <div className="flex items-center justify-center h-9">
                    <DeleteRowBtn onClick={() => equipment.remove(i)} />
                  </div>
                </div>
              ))}
              <Button
                type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs w-full"
                onClick={() => equipment.append({ sort_order: equipment.fields.length, equip_number: '', hours: null, rate: null })}
              >
                <Plus className="h-3 w-3" /> Add Equipment Row
              </Button>
            </CardContent>
          )}
        </Card>

        {/* ---- Photos placeholder ---- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-6 rounded-md border-2 border-dashed text-muted-foreground gap-2">
              <Camera className="h-7 w-7 opacity-40" />
              <p className="text-sm">Photo upload coming in a future update</p>
            </div>
          </CardContent>
        </Card>

        {/* Bottom save bar (mobile sticky) */}
        <div className="fixed bottom-0 left-0 right-0 md:relative md:bottom-auto border-t md:border-0 bg-background p-4 md:p-0 flex gap-3 z-10">
          <Button type="button" variant="outline" className="flex-1 md:flex-none" onClick={() => navigate('/tickets')}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="flex-1 md:flex-none gap-2"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save Draft'}
          </Button>
        </div>
      </form>
    </div>
  )
}
