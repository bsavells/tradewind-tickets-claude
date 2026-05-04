import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, UserPlus, Trash2, Building2, DollarSign, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  useCustomers, useUpsertCustomer, useToggleCustomerActive,
  useUpsertContact, useDeleteContact,
} from '@/hooks/useCustomers'
import { SortableTableHeader } from '@/components/SortableTableHeader'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useTableSort, cmpString, cmpBool, cmpNumber } from '@/hooks/useTableSort'
import { useClassifications } from '@/hooks/useClassifications'
import {
  useCustomerRates, useSaveCustomerRates,
  type CustomerRateMap,
} from '@/hooks/useCustomerRates'
import type { Database } from '@/lib/database.types'

type Customer = Database['public']['Tables']['customers']['Row']
type CustomerContact = Database['public']['Tables']['customer_contacts']['Row']

// ---- Schemas ----
const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: z.string().optional(),
})
type CustomerForm = z.infer<typeof customerSchema>

const contactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  title: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  is_primary: z.boolean(),
})
type ContactForm = z.infer<typeof contactSchema>

// ---- Customer dialog ----
function CustomerDialog({
  open, onClose, existing,
}: {
  open: boolean
  onClose: () => void
  existing?: Customer | null
}) {
  const upsert = useUpsertCustomer()
  const { register, handleSubmit, formState: { errors }, reset } = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: existing?.name ?? '', address: existing?.address ?? '' },
  })

  useEffect(() => {
    reset({ name: existing?.name ?? '', address: existing?.address ?? '' })
  }, [existing, reset])

  async function onSubmit(data: CustomerForm) {
    await upsert.mutateAsync({ ...data, id: existing?.id })
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Company Name *</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Input id="address" {...register('address')} />
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

// ---- Contact dialog ----
function ContactDialog({
  open, onClose, customerId, existing,
}: {
  open: boolean
  onClose: () => void
  customerId: string
  existing?: CustomerContact | null
}) {
  const upsert = useUpsertContact()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm<ContactForm>({
    resolver: zodResolver(contactSchema) as any,
    defaultValues: {
      name: existing?.name ?? '',
      title: existing?.title ?? '',
      phone: existing?.phone ?? '',
      email: existing?.email ?? '',
      is_primary: existing?.is_primary ?? false,
    },
  })

  // Re-populate whenever the contact being edited changes
  useEffect(() => {
    reset({
      name: existing?.name ?? '',
      title: existing?.title ?? '',
      phone: existing?.phone ?? '',
      email: existing?.email ?? '',
      is_primary: existing?.is_primary ?? false,
    })
  }, [existing, reset])

  async function onSubmit(data: ContactForm) {
    await upsert.mutateAsync({
      ...data,
      email: data.email || null,
      phone: data.phone || null,
      title: data.title || null,
      customer_id: customerId,
      id: existing?.id,
    })
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input {...register('title')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input {...register('phone')} type="tel" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input {...register('email')} type="email" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="is_primary"
              checked={watch('is_primary')}
              onCheckedChange={v => setValue('is_primary', v)}
            />
            <Label htmlFor="is_primary">Primary contact</Label>
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

// ---- Contacts panel inside expanded row ----
function ContactsPanel({ customer }: { customer: Customer & { customer_contacts: CustomerContact[] } }) {
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerContact | null>(null)
  const deleteContact = useDeleteContact()

  return (
    <div className="px-4 pb-4 pt-2 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contacts</p>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setAddOpen(true)}>
          <UserPlus className="h-3 w-3" /> Add Contact
        </Button>
      </div>

      {customer.customer_contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No contacts yet</p>
      ) : (
        <div className="space-y-2">
          {customer.customer_contacts.map(c => (
            <div key={c.id} className="flex items-start justify-between rounded-md border bg-muted/30 px-3 py-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.name}</span>
                  {c.is_primary && <Badge variant="secondary" className="text-xs h-4">Primary</Badge>}
                </div>
                {c.title && <p className="text-xs text-muted-foreground">{c.title}</p>}
                <div className="flex gap-3 mt-0.5">
                  {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                  {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Edit contact ${c.name}`}
                  className="h-7 w-7"
                  onClick={() => setEditing(c)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete contact ${c.name}`}
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => deleteContact.mutate(c.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ContactDialog open={addOpen} onClose={() => setAddOpen(false)} customerId={customer.id} />
      <ContactDialog
        open={!!editing} onClose={() => setEditing(null)}
        customerId={customer.id} existing={editing}
      />
    </div>
  )
}

// ---- Rate-overrides panel ----

interface RateInput {
  reg_rate: string
  ot_rate: string
}

/**
 * Per-customer rate override editor.
 *
 * Empty inputs render the default rate as a placeholder so admins can see
 * what the row will bill at without leaving the page. On save we diff the
 * desired state against the server state and emit upserts for set cells +
 * deletes for cleared cells.
 */
function RatesPanel({ customer }: { customer: Customer }) {
  const { data: classifications = [] } = useClassifications()
  const { data: serverRates = new Map(), isLoading } = useCustomerRates(customer.id)
  const saveRates = useSaveCustomerRates()

  const activeClassifications = useMemo(
    () => classifications.filter(c => c.active),
    [classifications],
  )

  // Local form state, keyed by classification id. We hold strings so the
  // user can clear a field; we coerce on save.
  const [inputs, setInputs] = useState<Map<string, RateInput>>(new Map())
  const [error, setError] = useState<string | null>(null)

  // Sync from server when serverRates changes (initial load + after save).
  useEffect(() => {
    const next = new Map<string, RateInput>()
    for (const [classId, rate] of serverRates) {
      next.set(classId, {
        reg_rate: String(rate.reg_rate),
        ot_rate: String(rate.ot_rate),
      })
    }
    setInputs(next)
    setError(null)
  }, [serverRates])

  function setField(classId: string, field: keyof RateInput, value: string) {
    setInputs(prev => {
      const next = new Map(prev)
      const existing = next.get(classId) ?? { reg_rate: '', ot_rate: '' }
      next.set(classId, { ...existing, [field]: value })
      return next
    })
  }

  // Build the desired CustomerRateMap from inputs:
  //  - Both fields empty → no override (omitted from the map)
  //  - Both fields filled → override with parsed numbers
  //  - One field filled → invalid
  function buildDesired(): { ok: boolean; map: CustomerRateMap; invalid: string[] } {
    const desired: CustomerRateMap = new Map()
    const invalid: string[] = []
    for (const [classId, fields] of inputs) {
      const reg = fields.reg_rate.trim()
      const ot = fields.ot_rate.trim()
      if (!reg && !ot) continue
      const regNum = Number(reg)
      const otNum = Number(ot)
      if (!reg || !ot || !Number.isFinite(regNum) || !Number.isFinite(otNum) || regNum < 0 || otNum < 0) {
        const name = activeClassifications.find(c => c.id === classId)?.name ?? classId
        invalid.push(name)
        continue
      }
      desired.set(classId, { reg_rate: regNum, ot_rate: otNum })
    }
    return { ok: invalid.length === 0, map: desired, invalid }
  }

  const dirty = useMemo(() => {
    // Compare current inputs with serverRates; quick string-based check.
    if (inputs.size === 0 && serverRates.size === 0) return false
    // Different number of overrides
    let setRows = 0
    for (const [classId, fields] of inputs) {
      const reg = fields.reg_rate.trim()
      const ot = fields.ot_rate.trim()
      if (!reg && !ot) continue
      setRows++
      const server = serverRates.get(classId)
      if (!server) return true
      if (Number(reg) !== server.reg_rate || Number(ot) !== server.ot_rate) return true
    }
    return setRows !== serverRates.size
  }, [inputs, serverRates])

  async function handleSave() {
    setError(null)
    const built = buildDesired()
    if (!built.ok) {
      setError(`Both Reg and OT rates are required for: ${built.invalid.join(', ')}.`)
      return
    }
    try {
      await saveRates.mutateAsync({
        customerId: customer.id,
        desired: built.map,
        previous: serverRates,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rates.')
    }
  }

  return (
    <div className="px-4 pb-4 pt-2 space-y-3 border-t border-border/40">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Rate Overrides
        </p>
        <p className="text-xs text-muted-foreground">
          Leave blank to use the default classification rate.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground italic">Loading rates…</p>
      ) : activeClassifications.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No active classifications. Add one in Settings → Classifications first.
        </p>
      ) : (
        <div className="space-y-2">
          {activeClassifications.map(c => {
            const fields = inputs.get(c.id) ?? { reg_rate: '', ot_rate: '' }
            const defaultReg = Number(c.default_reg_rate).toFixed(2)
            const defaultOt = Number(c.default_ot_rate).toFixed(2)
            return (
              <div
                key={c.id}
                className="grid grid-cols-12 gap-2 items-center rounded-md border bg-muted/30 px-3 py-2"
              >
                <div className="col-span-12 md:col-span-4 text-sm font-medium">
                  {c.name}
                </div>
                <div className="col-span-6 md:col-span-4">
                  <Label className="text-xs text-muted-foreground">Reg $/hr</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      className="h-8 pl-7"
                      placeholder={`${defaultReg} default`}
                      value={fields.reg_rate}
                      onChange={e => setField(c.id, 'reg_rate', e.target.value)}
                    />
                  </div>
                </div>
                <div className="col-span-6 md:col-span-4">
                  <Label className="text-xs text-muted-foreground">OT $/hr</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      className="h-8 pl-7"
                      placeholder={`${defaultOt} default`}
                      value={fields.ot_rate}
                      onChange={e => setField(c.id, 'ot_rate', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {dirty && (
        <div className="flex justify-end gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => {
              // Revert to server state
              const next = new Map<string, RateInput>()
              for (const [classId, rate] of serverRates) {
                next.set(classId, {
                  reg_rate: String(rate.reg_rate),
                  ot_rate: String(rate.ot_rate),
                })
              }
              setInputs(next)
              setError(null)
            }}
            disabled={saveRates.isPending}
          >
            Discard
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleSave}
            disabled={saveRates.isPending}
          >
            <Save className="h-3.5 w-3.5" />
            {saveRates.isPending ? 'Saving…' : 'Save rates'}
          </Button>
        </div>
      )}
    </div>
  )
}

// ---- Main page ----
type CustomerSortKey = 'name' | 'address' | 'contacts' | 'active'

export function AdminCustomersPage() {
  useDocumentTitle('Customers')
  const { data: customers = [], isLoading } = useCustomers()
  const toggleActive = useToggleCustomerActive()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { sortKey, sortDir, handleSort } = useTableSort<CustomerSortKey>('name', 'asc')

  const sortedCustomers = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const arr = [...customers]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name': cmp = cmpString(a.name, b.name); break
        case 'address': cmp = cmpString(a.address, b.address); break
        case 'contacts': cmp = cmpNumber(a.customer_contacts.length, b.customer_contacts.length); break
        case 'active': cmp = cmpBool(a.active, b.active); break
      }
      if (cmp !== 0) return cmp * dir
      return cmpString(a.name, b.name) // stable tiebreaker
    })
    return arr
  }, [customers, sortKey, sortDir])

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground text-sm">Manage customer accounts and contacts</p>
        </div>
        <Button className="gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Customer
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2">
              <Building2 className="h-8 w-8 opacity-30" />
              <p className="text-sm">No customers yet — add your first one.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHeader columnKey="name" label="Name" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <SortableTableHeader columnKey="address" label="Address" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                  <SortableTableHeader columnKey="contacts" label="Contacts" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                  <SortableTableHeader columnKey="active" label="Active" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCustomers.map(c => (
                  <>
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {c.address ?? '—'}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                        {c.customer_contacts.length}
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Switch
                          checked={c.active}
                          onCheckedChange={active => toggleActive.mutate({ id: c.id, active })}
                        />
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Button
                          size="sm" variant="ghost" className="gap-1.5"
                          onClick={() => setEditing(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expanded === c.id && (
                      <TableRow key={`${c.id}-contacts`}>
                        <TableCell colSpan={5} className="p-0 bg-muted/20">
                          <ContactsPanel customer={c} />
                          <RatesPanel customer={c} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CustomerDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <CustomerDialog open={!!editing} onClose={() => setEditing(null)} existing={editing} />
    </div>
  )
}
