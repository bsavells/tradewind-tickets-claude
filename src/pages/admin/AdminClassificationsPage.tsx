import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useClassifications, useUpsertClassification, useToggleClassificationActive } from '@/hooks/useClassifications'
import { SortableTableHeader } from '@/components/SortableTableHeader'
import { useTableSort, cmpString, cmpBool, cmpNumber } from '@/hooks/useTableSort'
import type { Database } from '@/lib/database.types'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

type Classification = Database['public']['Tables']['classifications']['Row']

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  default_reg_rate: z.coerce.number().min(0, 'Must be 0 or more'),
  default_ot_rate: z.coerce.number().min(0, 'Must be 0 or more'),
})
type Form = z.infer<typeof schema>

function ClassificationDialog({
  open, onClose, existing,
}: {
  open: boolean
  onClose: () => void
  existing?: Classification | null
}) {
  const upsert = useUpsertClassification()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors }, reset } = useForm<Form>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      name: existing?.name ?? '',
      default_reg_rate: existing?.default_reg_rate ?? 0,
      default_ot_rate: existing?.default_ot_rate ?? 0,
    },
  })

  useEffect(() => {
    reset({
      name: existing?.name ?? '',
      default_reg_rate: existing?.default_reg_rate ?? 0,
      default_ot_rate: existing?.default_ot_rate ?? 0,
    })
  }, [existing, reset])

  async function onSubmit(data: Form) {
    await upsert.mutateAsync({ ...data, id: existing?.id })
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Classification' : 'Add Classification'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input {...register('name')} placeholder="e.g. Sr. Tech" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Reg Rate ($/hr)</Label>
              <Input type="number" step="0.01" min="0" {...register('default_reg_rate')} />
              {errors.default_reg_rate && <p className="text-xs text-destructive">{errors.default_reg_rate.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>OT Rate ($/hr)</Label>
              <Input type="number" step="0.01" min="0" {...register('default_ot_rate')} />
              {errors.default_ot_rate && <p className="text-xs text-destructive">{errors.default_ot_rate.message}</p>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            These are default rates. Admins can override them per ticket during review.
          </p>
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

type ClassSortKey = 'name' | 'reg_rate' | 'ot_rate' | 'active'

export function AdminClassificationsPage() {
  useDocumentTitle('Classifications')
  const { data: classifications = [], isLoading } = useClassifications()
  const toggleActive = useToggleClassificationActive()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Classification | null>(null)

  const { sortKey, sortDir, handleSort } = useTableSort<ClassSortKey>('name', 'asc')

  const sortedClassifications = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const arr = [...classifications]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name': cmp = cmpString(a.name, b.name); break
        case 'reg_rate': cmp = cmpNumber(Number(a.default_reg_rate), Number(b.default_reg_rate)); break
        case 'ot_rate': cmp = cmpNumber(Number(a.default_ot_rate), Number(b.default_ot_rate)); break
        case 'active': cmp = cmpBool(a.active, b.active); break
      }
      if (cmp !== 0) return cmp * dir
      return cmpString(a.name, b.name)
    })
    return arr
  }, [classifications, sortKey, sortDir])

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Classifications</h1>
          <p className="text-muted-foreground text-sm">Labor categories and default billing rates</p>
        </div>
        <Button className="gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Classification
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : classifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2">
              <Tag className="h-8 w-8 opacity-30" />
              <p className="text-sm">No classifications yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHeader columnKey="name" label="Name" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <SortableTableHeader columnKey="reg_rate" label="Reg Rate" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <SortableTableHeader columnKey="ot_rate" label="OT Rate" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <SortableTableHeader columnKey="active" label="Active" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedClassifications.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>${Number(c.default_reg_rate).toFixed(2)}/hr</TableCell>
                    <TableCell>${Number(c.default_ot_rate).toFixed(2)}/hr</TableCell>
                    <TableCell>
                      <Switch
                        checked={c.active}
                        onCheckedChange={active => toggleActive.mutate({ id: c.id, active })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditing(c)}>
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

      <ClassificationDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <ClassificationDialog open={!!editing} onClose={() => setEditing(null)} existing={editing} />
    </div>
  )
}
