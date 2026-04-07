import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useVehicles, useUpsertVehicle, useToggleVehicleActive } from '@/hooks/useVehicles'
import { useProfiles } from '@/hooks/useProfiles'
import type { Database } from '@/lib/database.types'

type Vehicle = Database['public']['Tables']['vehicles']['Row']

const schema = z.object({
  label: z.string().min(1, 'Label is required'),
  description: z.string().optional(),
  default_mileage_rate: z.preprocess(v => parseFloat(String(v)), z.number().min(0)),
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<Form>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      label: existing?.label ?? '',
      description: existing?.description ?? '',
      default_mileage_rate: existing?.default_mileage_rate ?? 0,
      assigned_user_id: existing?.assigned_user_id ?? null,
    },
  })

  async function onSubmit(data: Form) {
    await upsert.mutateAsync({
      label: data.label,
      description: data.description || null,
      default_mileage_rate: data.default_mileage_rate,
      assigned_user_id: data.assigned_user_id || null,
      id: existing?.id,
    })
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Label *</Label>
              <Input {...register('label')} placeholder="e.g. (1)" />
              {errors.label && <p className="text-xs text-destructive">{errors.label.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Mileage Rate ($/mi)</Label>
              <Input type="number" step="0.01" min="0" {...register('default_mileage_rate')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input {...register('description')} placeholder="e.g. 2022 Ford F-250" />
          </div>
          <div className="space-y-1.5">
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AdminVehiclesPage() {
  const { data: vehicles = [], isLoading } = useVehicles()
  const toggleActive = useToggleVehicleActive()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Vehicle | null>(null)

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vehicles</h1>
          <p className="text-muted-foreground text-sm">Company vehicles and mileage rates</p>
        </div>
        <Button className="gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Vehicle
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : vehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2">
              <Truck className="h-8 w-8 opacity-30" />
              <p className="text-sm">No vehicles yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                  <TableHead>Mileage Rate</TableHead>
                  <TableHead className="hidden sm:table-cell">Assigned To</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.label}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                      {v.description ?? '—'}
                    </TableCell>
                    <TableCell>${Number(v.default_mileage_rate).toFixed(2)}/mi</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {v.profiles
                        ? `${v.profiles.first_name} ${v.profiles.last_name}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={v.active}
                        onCheckedChange={active => toggleActive.mutate({ id: v.id, active })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditing(v)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <VehicleDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <VehicleDialog open={!!editing} onClose={() => setEditing(null)} existing={editing} />
    </div>
  )
}
