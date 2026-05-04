import { useMemo, useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, Pencil, Trash2, Search, Building2, Package, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { SortableTableHeader } from '@/components/SortableTableHeader'
import { useTableSort, cmpString, cmpNumber, cmpBool } from '@/hooks/useTableSort'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import {
  useCatalogVendors,
  useUpsertCatalogVendor,
  useDeleteCatalogVendor,
  useCatalogItemsAdmin,
  useUpsertCatalogItem,
  useDeleteCatalogItem,
  sellPrice,
  type CatalogItem,
  type CatalogVendor,
} from '@/hooks/useCatalog'

// ── Vendor dialog ────────────────────────────────────────────────────────────

const vendorSchema = z.object({
  name: z.string().min(1, 'Required').max(120),
  active: z.boolean(),
})
type VendorForm = z.infer<typeof vendorSchema>

function VendorDialog({
  open, onClose, existing,
}: {
  open: boolean
  onClose: () => void
  existing?: CatalogVendor | null
}) {
  const upsert = useUpsertCatalogVendor()
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<VendorForm>({
    resolver: zodResolver(vendorSchema),
    defaultValues: { name: existing?.name ?? '', active: existing?.active ?? true },
  })
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      reset({ name: existing?.name ?? '', active: existing?.active ?? true })
      setServerError(null)
    }
  }, [open, existing, reset])

  async function onSubmit(values: VendorForm) {
    setServerError(null)
    try {
      await upsert.mutateAsync({ id: existing?.id, ...values })
      onClose()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Failed to save vendor.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
          <DialogDescription>
            Vendor names must be unique. Items reference the vendor record.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="vendor-name">Name</Label>
            <Input id="vendor-name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="vendor-active"
              checked={watch('active')}
              onCheckedChange={v => setValue('active', v)}
            />
            <Label htmlFor="vendor-active">Active</Label>
          </div>
          {serverError && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {serverError}
            </div>
          )}
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

// ── Item dialog ──────────────────────────────────────────────────────────────

const itemSchema = z.object({
  vendor_id: z.string().min(1, 'Pick a vendor'),
  part_number: z.string(),
  description: z.string(),
  size: z.string(),
  packaging_unit: z.string(),
  unit_cost: z.string(),
  markup_pct: z.string().min(1, 'Required'),
  active: z.boolean(),
})
type ItemForm = z.infer<typeof itemSchema>

function ItemDialog({
  open, onClose, existing, vendors,
}: {
  open: boolean
  onClose: () => void
  existing?: CatalogItem | null
  vendors: CatalogVendor[]
}) {
  const upsert = useUpsertCatalogItem()
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    defaultValues: defaultItemFormValues(existing),
  })
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      reset(defaultItemFormValues(existing))
      setServerError(null)
    }
  }, [open, existing, reset])

  const cost = parseFloat(watch('unit_cost'))
  const markup = parseFloat(watch('markup_pct'))
  const previewSell =
    Number.isFinite(cost) && Number.isFinite(markup)
      ? Number((cost * (1 + markup / 100)).toFixed(2))
      : null

  async function onSubmit(values: ItemForm) {
    setServerError(null)
    try {
      await upsert.mutateAsync({
        id: existing?.id,
        vendor_id: values.vendor_id,
        part_number: values.part_number || null,
        description: values.description || null,
        size: values.size || null,
        packaging_unit: values.packaging_unit || null,
        unit_cost: values.unit_cost === '' ? null : Number(values.unit_cost),
        markup_pct: Number(values.markup_pct),
        active: values.active,
      })
      onClose()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Failed to save item.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Catalog Item' : 'Add Catalog Item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="item-vendor">Vendor *</Label>
            <Select
              value={watch('vendor_id')}
              onValueChange={v => setValue('vendor_id', v, { shouldValidate: true })}
            >
              <SelectTrigger id="item-vendor">
                <SelectValue placeholder="Select vendor…" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {vendors.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.vendor_id && <p className="text-xs text-destructive">{errors.vendor_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="item-part">Part Number</Label>
              <Input id="item-part" {...register('part_number')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-size">Size</Label>
              <Input id="item-size" {...register('size')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item-desc">Description</Label>
            <Input id="item-desc" {...register('description')} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="item-pkg">Packaging</Label>
              <Input id="item-pkg" {...register('packaging_unit')} placeholder="e.g. Per 1" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-cost">Unit Cost</Label>
              <Input id="item-cost" type="number" step="0.01" min="0" {...register('unit_cost')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-markup">Markup % *</Label>
              <Input id="item-markup" type="number" step="0.01" min="0" {...register('markup_pct')} />
              {errors.markup_pct && <p className="text-xs text-destructive">{errors.markup_pct.message}</p>}
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Sell price preview</span>
            <span className="font-medium tabular-nums">
              {previewSell != null ? `$${previewSell.toFixed(2)}` : '—'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="item-active"
              checked={watch('active')}
              onCheckedChange={v => setValue('active', v)}
            />
            <Label htmlFor="item-active">Active</Label>
          </div>

          {serverError && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {serverError}
            </div>
          )}
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

function defaultItemFormValues(existing?: CatalogItem | null): ItemForm {
  return {
    vendor_id: existing?.vendor_id ?? '',
    part_number: existing?.part_number ?? '',
    description: existing?.description ?? '',
    size: existing?.size ?? '',
    packaging_unit: existing?.packaging_unit ?? '',
    unit_cost: existing?.unit_cost == null ? '' : String(existing.unit_cost),
    markup_pct: existing?.markup_pct == null ? '30' : String(existing.markup_pct),
    active: existing?.active ?? true,
  }
}

// ── Vendors panel ────────────────────────────────────────────────────────────

function VendorsPanel({ vendors }: { vendors: CatalogVendor[] }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogVendor | null>(null)
  const deleteVendor = useDeleteCatalogVendor()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete(v: CatalogVendor) {
    setDeleteError(null)
    if (!confirm(`Delete vendor "${v.name}"?`)) return
    try {
      await deleteVendor.mutateAsync(v.id)
    } catch (e) {
      // RESTRICTed by FK from catalog_items — surface a friendly message.
      const msg = e instanceof Error ? e.message : 'Failed to delete vendor.'
      setDeleteError(
        msg.toLowerCase().includes('foreign')
          ? `${v.name} still has items — deactivate it instead, or delete its items first.`
          : msg,
      )
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Vendors</h2>
            <Badge variant="outline" className="text-xs">{vendors.length}</Badge>
          </div>
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => { setEditing(null); setOpen(true) }}>
            <Plus className="h-3.5 w-3.5" /> Add Vendor
          </Button>
        </div>

        {deleteError && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {deleteError}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
          {vendors.map(v => (
            <div
              key={v.id}
              className="flex items-center justify-between rounded-md border bg-muted/30 px-2 py-1 text-sm"
            >
              <div className="min-w-0 flex-1">
                <span className="truncate block">{v.name}</span>
                {!v.active && <span className="text-[10px] text-muted-foreground">Inactive</span>}
              </div>
              <div className="flex">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Edit vendor ${v.name}`}
                  className="h-6 w-6"
                  onClick={() => { setEditing(v); setOpen(true) }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete vendor ${v.name}`}
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(v)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <VendorDialog
          open={open}
          onClose={() => { setOpen(false); setEditing(null) }}
          existing={editing}
        />
      </CardContent>
    </Card>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

type ItemSortKey = 'vendor' | 'part_number' | 'description' | 'unit_cost' | 'markup_pct' | 'sell' | 'active'

export function AdminCatalogPage() {
  useDocumentTitle('Catalog')
  const { data: vendors = [], isLoading: vendorsLoading } = useCatalogVendors()
  const { data: items = [], isLoading: itemsLoading } = useCatalogItemsAdmin()
  const deleteItem = useDeleteCatalogItem()

  const [search, setSearch] = useState('')
  const [vendorFilter, setVendorFilter] = useState<string>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<CatalogItem | null>(null)
  const [adding, setAdding] = useState(false)

  const vendorMap = useMemo(
    () => new Map(vendors.map(v => [v.id, v.name])),
    [vendors],
  )

  const { sortKey, sortDir, handleSort } = useTableSort<ItemSortKey>('vendor', 'asc')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(i => {
      if (!showInactive && !i.active) return false
      if (vendorFilter !== 'all' && i.vendor_id !== vendorFilter) return false
      if (!q) return true
      return (i.part_number?.toLowerCase().includes(q) ?? false)
        || (i.description?.toLowerCase().includes(q) ?? false)
    })
  }, [items, search, vendorFilter, showInactive])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'vendor':
          cmp = cmpString(vendorMap.get(a.vendor_id), vendorMap.get(b.vendor_id))
          break
        case 'part_number':
          cmp = cmpString(a.part_number, b.part_number)
          break
        case 'description':
          cmp = cmpString(a.description, b.description)
          break
        case 'unit_cost':
          cmp = cmpNumber(a.unit_cost, b.unit_cost)
          break
        case 'markup_pct':
          cmp = cmpNumber(Number(a.markup_pct), Number(b.markup_pct))
          break
        case 'sell':
          cmp = cmpNumber(sellPrice(a), sellPrice(b))
          break
        case 'active':
          cmp = cmpBool(a.active, b.active)
          break
      }
      if (cmp !== 0) return cmp * dir
      // Stable tiebreaker: vendor → part → description.
      const t1 = cmpString(vendorMap.get(a.vendor_id), vendorMap.get(b.vendor_id))
      if (t1) return t1
      const t2 = cmpString(a.part_number, b.part_number)
      if (t2) return t2
      return cmpString(a.description, b.description)
    })
  }, [filtered, sortKey, sortDir, vendorMap])

  if (vendorsLoading || itemsLoading) {
    return (
      <div className="flex justify-center items-center h-60">
        <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" /> Catalog
          </h1>
          <p className="text-muted-foreground text-sm">
            Vendors, items, and per-item markup. Sell price is computed live as
            cost × (1 + markup ÷ 100). Techs see items but never see cost or markup.
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add Item
        </Button>
      </div>

      <VendorsPanel vendors={vendors} />

      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search part number or description…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={vendorFilter} onValueChange={setVendorFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All vendors</SelectItem>
                {vendors.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} />
              Show inactive
            </Label>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {sorted.length} of {items.length}
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHeader<ItemSortKey> columnKey="vendor" label="Vendor"
                  activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                <SortableTableHeader<ItemSortKey> columnKey="part_number" label="Part #"
                  activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                <SortableTableHeader<ItemSortKey> columnKey="description" label="Description"
                  activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                <TableHead>Size</TableHead>
                <SortableTableHeader<ItemSortKey> columnKey="unit_cost" label="Cost"
                  activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" />
                <SortableTableHeader<ItemSortKey> columnKey="markup_pct" label="Markup"
                  activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" />
                <SortableTableHeader<ItemSortKey> columnKey="sell" label="Sell"
                  activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" />
                <SortableTableHeader<ItemSortKey> columnKey="active" label="Active"
                  activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                    No items match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map(i => {
                  const sell = sellPrice(i)
                  return (
                    <TableRow key={i.id} className={!i.active ? 'opacity-60' : ''}>
                      <TableCell className="text-sm">{vendorMap.get(i.vendor_id) ?? '—'}</TableCell>
                      <TableCell className="text-sm font-mono">{i.part_number || '—'}</TableCell>
                      <TableCell className="text-sm max-w-md truncate">{i.description || '—'}</TableCell>
                      <TableCell className="text-sm text-right">{i.size || '—'}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums">
                        {i.unit_cost == null ? '—' : `$${Number(i.unit_cost).toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-sm text-right tabular-nums">
                        {Number(i.markup_pct).toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-sm text-right tabular-nums font-medium">
                        {sell == null ? '—' : `$${sell.toFixed(2)}`}
                      </TableCell>
                      <TableCell>
                        {i.active
                          ? <Badge variant="secondary" className="text-xs">Active</Badge>
                          : <Badge variant="outline" className="text-xs">Inactive</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit item ${i.part_number ?? i.description ?? i.id}`}
                          className="h-7 w-7"
                          onClick={() => setEditing(i)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete item ${i.part_number ?? i.description ?? i.id}`}
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete this catalog item? Existing tickets that reference it will keep their snapshot data.`)) {
                              void deleteItem.mutateAsync(i.id)
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ItemDialog
        open={adding}
        onClose={() => setAdding(false)}
        vendors={vendors.filter(v => v.active)}
      />
      <ItemDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        existing={editing}
        vendors={vendors}
      />
    </div>
  )
}
