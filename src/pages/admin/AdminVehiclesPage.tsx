import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Truck, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { useTableSort, cmpString, cmpNumber } from '@/hooks/useTableSort'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useVehicles, useUpsertVehicle, useToggleVehicleActive } from '@/hooks/useVehicles'
import { useProfiles } from '@/hooks/useProfiles'
import type { Database } from '@/lib/database.types'

type Vehicle = Database['public']['Tables']['vehicles']['Row']

const intOrNull = (v: unknown) => {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

const schema = z.object({
  label: z.string().min(1, 'Display name is required'),
  truck_number: z.string().optional(),
  year: z.preprocess(intOrNull, z.number().int().min(1900).max(2100).nullable()),
  make: z.string().optional(),
  model: z.string().optional(),
  color: z.string().optional(),
  license_plate: z.string().optional(),
  date_acquired: z.string().optional(),
  is_lease: z.boolean().default(false),
  lease_end_date: z.string().optional(),
  default_mileage_rate: z.preprocess(
    v => (v === '' || v == null ? 0 : parseFloat(String(v))),
    z.number().min(0),
  ),
  current_mileage: z.preprocess(intOrNull, z.number().int().min(0).nullable()),
  assigned_user_id: z.string().nullable().optional(),
})
type Form = z.infer<typeof schema>

function VehicleDialog({
  open, onClose, existing,
}: {
  open: boolean
  onClose: () => void
  existing?: Vehicle | null
}) {
  const upsert = useUpsertVehicle()
  const { data: users = [] } = useProfiles()

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<Form>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      label: existing?.label ?? '',
      truck_number: existing?.truck_number ?? '',
      year: existing?.year ?? undefined,
      make: existing?.make ?? '',
      model: existing?.model ?? '',
      color: existing?.color ?? '',
      license_plate: existing?.license_plate ?? '',
      date_acquired: existing?.date_acquired ?? '',
      is_lease: existing?.is_lease ?? false,
      lease_end_date: existing?.lease_end_date ?? '',
      default_mileage_rate: existing?.default_mileage_rate ?? 0,
      current_mileage: existing?.current_mileage ?? undefined,
      assigned_user_id: existing?.assigned_user_id ?? null,
    },
  })

  const isLease = watch('is_lease')

  async function onSubmit(data: Form) {
    await upsert.mutateAsync({
      id: existing?.id,
      label: data.label,
      truck_number: data.truck_number || null,
      year: data.year,
      make: data.make || null,
      model: data.model || null,
      color: data.color || null,
      license_plate: data.license_plate || null,
      date_acquired: data.date_acquired || null,
      is_lease: data.is_lease,
      lease_end_date: data.is_lease ? (data.lease_end_date || null) : null,
      default_mileage_rate: data.default_mileage_rate,
      current_mileage: data.current_mileage,
      assigned_user_id: data.assigned_user_id || null,
    })
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* Identity */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Identity</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Display Name *</Label>
                <Input {...register('label')} placeholder="e.g. Truck 1" />
                {errors.label && <p className="text-xs text-destructive">{errors.label.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Truck Number</Label>
                <Input {...register('truck_number')} placeholder="e.g. T-001" />
              </div>
            </div>
          </div>

          {/* Vehicle Details */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Vehicle Details</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Year</Label>
                <Input
                  type="number"
                  min={1900}
                  max={2100}
                  placeholder="e.g. 2022"
                  {...register('year')}
                />
                {errors.year && <p className="text-xs text-destructive">{errors.year.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Make</Label>
                <Input {...register('make')} placeholder="e.g. Ford" />
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input {...register('model')} placeholder="e.g. F-250" />
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <Input {...register('color')} placeholder="e.g. White" />
              </div>
            </div>
          </div>

          {/* Registration */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Registration</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>License Plate</Label>
                <Input {...register('license_plate')} placeholder="e.g. ABC-1234" />
              </div>
              <div className="space-y-1.5">
                <Label>Date Acquired</Label>
                <Input type="date" {...register('date_acquired')} />
              </div>
            </div>
          </div>

          {/* Lease */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Lease</p>
            <div className="flex items-center gap-3 mb-3">
              <Switch
                checked={isLease}
                onCheckedChange={v => setValue('is_lease', v)}
              />
              <span className="text-sm">This vehicle is a lease</span>
            </div>
            {isLease && (
              <div className="space-y-1.5 max-w-xs">
                <Label>Lease End Date</Label>
                <Input type="date" {...register('lease_end_date')} />
              </div>
            )}
          </div>

          {/* Operational */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Operational</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Mileage Rate ($/mi)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('default_mileage_rate')}
                />
                {errors.default_mileage_rate && (
                  <p className="text-xs text-destructive">{errors.default_mileage_rate.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Current Mileage (mi)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 42000"
                  {...register('current_mileage')}
                />
                {errors.current_mileage && (
                  <p className="text-xs text-destructive">{errors.current_mileage.message}</p>
                )}
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label>Assigned To</Label>
                <Select
                  value={watch('assigned_user_id') ?? 'none'}
                  onValueChange={v => setValue('assigned_user_id', v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.first_name} {u.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving…' : 'Save Vehicle'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function VehicleCard({ v, assigneeName, onEdit, onToggle }: {
  v: Vehicle
  assigneeName: string | null
  onEdit: () => void
  onToggle: (active: boolean) => void
}) {
  const yearMakeModel = [v.year, v.make, v.model].filter(Boolean).join(' ')

  return (
    <div className="flex items-start gap-4 px-4 py-3.5 border-b last:border-0">
      <Truck className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{v.label}</span>
          {v.truck_number && (
            <span className="text-xs text-muted-foreground">#{v.truck_number}</span>
          )}
          {v.is_lease && (
            <Badge variant="outline" className="text-xs h-4 px-1.5">Lease</Badge>
          )}
          {!v.active && (
            <Badge variant="secondary" className="text-xs h-4 px-1.5">Inactive</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
          {yearMakeModel && (
            <p className="text-xs text-muted-foreground">{yearMakeModel}</p>
          )}
          {v.color && (
            <p className="text-xs text-muted-foreground">{v.color}</p>
          )}
          {v.license_plate && (
            <p className="text-xs text-muted-foreground">Plate: {v.license_plate}</p>
          )}
          {v.current_mileage != null && (
            <p className="text-xs text-muted-foreground">{v.current_mileage.toLocaleString()} mi</p>
          )}
          {assigneeName && (
            <p className="text-xs text-muted-foreground">{assigneeName}</p>
          )}
          {v.is_lease && v.lease_end_date && (
            <p className="text-xs text-muted-foreground">
              Lease ends {new Date(v.lease_end_date).toLocaleDateString()}
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          ${Number(v.default_mileage_rate).toFixed(2)}/mi
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Switch
          checked={v.active}
          onCheckedChange={onToggle}
        />
        <Button size="sm" variant="ghost" className="gap-1.5 h-8" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>
    </div>
  )
}

type VehicleSortKey = 'label' | 'truck_number' | 'year' | 'mileage' | 'rate' | 'assignee'

const VEHICLE_SORT_OPTIONS: { key: VehicleSortKey; label: string }[] = [
  { key: 'label', label: 'Label' },
  { key: 'truck_number', label: 'Truck #' },
  { key: 'year', label: 'Year' },
  { key: 'mileage', label: 'Mileage' },
  { key: 'rate', label: 'Rate' },
  { key: 'assignee', label: 'Assignee' },
]

export function AdminVehiclesPage() {
  const { data: vehicles = [], isLoading } = useVehicles()
  const { data: users = [] } = useProfiles()
  const toggleActive = useToggleVehicleActive()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Vehicle | null>(null)

  const userMap = useMemo(
    () => new Map(users.map(u => [u.id, `${u.first_name} ${u.last_name}`])),
    [users]
  )

  const { sortKey, sortDir, handleSort } = useTableSort<VehicleSortKey>('label', 'asc')

  const compare = (a: Vehicle, b: Vehicle): number => {
    const dir = sortDir === 'asc' ? 1 : -1
    let cmp = 0
    switch (sortKey) {
      case 'label': cmp = cmpString(a.label, b.label); break
      case 'truck_number': cmp = cmpString(a.truck_number, b.truck_number); break
      case 'year': cmp = cmpNumber(a.year, b.year); break
      case 'mileage': cmp = cmpNumber(a.current_mileage, b.current_mileage); break
      case 'rate': cmp = cmpNumber(Number(a.default_mileage_rate), Number(b.default_mileage_rate)); break
      case 'assignee': {
        const aName = a.assigned_user_id ? userMap.get(a.assigned_user_id) : undefined
        const bName = b.assigned_user_id ? userMap.get(b.assigned_user_id) : undefined
        cmp = cmpString(aName, bName)
        break
      }
    }
    if (cmp !== 0) return cmp * dir
    return cmpString(a.label, b.label) // stable tiebreaker
  }

  const active = useMemo(
    () => vehicles.filter(v => v.active).sort(compare),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicles, sortKey, sortDir, userMap],
  )
  const inactive = useMemo(
    () => vehicles.filter(v => !v.active).sort(compare),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicles, sortKey, sortDir, userMap],
  )

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Vehicles</h1>
          <p className="text-muted-foreground text-sm">Manage company vehicles, registration, and mileage</p>
        </div>
        <Button className="gap-2 shrink-0" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Vehicle
        </Button>
      </div>

      {/* Sort bar */}
      {!isLoading && vehicles.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="tw-label">Sort by:</span>
          {VEHICLE_SORT_OPTIONS.map(opt => {
            const isActive = sortKey === opt.key
            const Icon = !isActive ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleSort(opt.key)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-md border inline-flex items-center gap-1 transition-colors',
                  isActive
                    ? 'bg-[var(--color-tw-navy)] border-[var(--color-tw-navy)] text-white'
                    : 'bg-card hover:border-[var(--color-tw-blue)]/50',
                )}
                aria-label={`Sort by ${opt.label}${isActive ? ` (${sortDir})` : ''}`}
              >
                {opt.label}
                <Icon
                  className={cn(
                    'h-3 w-3',
                    isActive ? 'text-[var(--color-tw-cyan)]' : 'text-muted-foreground/40',
                  )}
                />
              </button>
            )
          })}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : vehicles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Truck className="h-10 w-10 opacity-30" />
            <p className="font-medium">No vehicles yet</p>
            <p className="text-sm">Add your first vehicle to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Active vehicles */}
          <Card className="overflow-hidden">
            <div className="px-4 py-2.5 border-b bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Active · {active.length}
              </p>
            </div>
            {active.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">No active vehicles.</div>
            ) : (
              active.map(v => (
                <VehicleCard
                  key={v.id}
                  v={v}
                  assigneeName={v.assigned_user_id ? (userMap.get(v.assigned_user_id) ?? null) : null}
                  onEdit={() => setEditing(v)}
                  onToggle={active => toggleActive.mutate({ id: v.id, active })}
                />
              ))
            )}
          </Card>

          {/* Inactive vehicles */}
          {inactive.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Inactive · {inactive.length}
                </p>
              </div>
              {inactive.map(v => (
                <VehicleCard
                  key={v.id}
                  v={v}
                  assigneeName={v.assigned_user_id ? (userMap.get(v.assigned_user_id) ?? null) : null}
                  onEdit={() => setEditing(v)}
                  onToggle={active => toggleActive.mutate({ id: v.id, active })}
                />
              ))}
            </Card>
          )}
        </>
      )}

      <VehicleDialog open={addOpen} onClose={() => setAddOpen(false)} />
      {editing && (
        <VehicleDialog
          open={!!editing}
          onClose={() => setEditing(null)}
          existing={editing}
        />
      )}
    </div>
  )
}
