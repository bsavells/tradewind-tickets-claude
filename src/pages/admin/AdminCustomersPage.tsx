import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, UserPlus, Trash2, Building2 } from 'lucide-react'
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
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(c)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
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

// ---- Main page ----
export function AdminCustomersPage() {
  const { data: customers = [], isLoading } = useCustomers()
  const toggleActive = useToggleCustomerActive()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

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
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Address</TableHead>
                  <TableHead className="hidden sm:table-cell">Contacts</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map(c => (
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
