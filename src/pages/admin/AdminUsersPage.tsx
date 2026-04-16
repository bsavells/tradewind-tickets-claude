import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Users, Trash2, KeyRound, RotateCcw, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProfiles, useUpdateProfile, useCreateUser, useDeleteUser, useReactivateUser, usePermanentlyDeleteUser, useSendPasswordReset } from '@/hooks/useProfiles'
import { useClassifications } from '@/hooks/useClassifications'
import { useVehicles } from '@/hooks/useVehicles'
import { useAuth } from '@/contexts/AuthContext'
import { useNotificationPrefs, useUpsertNotificationPref, type EmailFrequency } from '@/hooks/useNotifications'
import { FreqSelector } from '@/pages/NotificationPrefsPage'
import type { Database } from '@/lib/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

// ---- Edit user dialog ----
const editSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  role: z.enum(['user', 'admin']),
  is_readonly_admin: z.boolean(),
  classification_id: z.string().nullable().optional(),
  default_vehicle_id: z.string().nullable().optional(),
  active: z.boolean(),
})
type EditForm = z.infer<typeof editSchema>

// ── Notification preference rows shown in EditUserDialog ──────────────────────
const ADMIN_NOTIF_PREFS = [
  { key: 'on_submit', label: 'New ticket submitted' },
  { key: 'on_return_request', label: 'Return requested on finalized ticket' },
  { key: 'on_signed', label: 'Ticket signed by customer' },
]
const USER_NOTIF_PREFS = [
  { key: 'on_return', label: 'Ticket returned for revision' },
  { key: 'on_finalize', label: 'Ticket finalized' },
  { key: 'on_delete', label: 'Ticket deleted' },
  { key: 'on_signed', label: 'Ticket signed by customer' },
]

function EditUserDialog({
  open, onClose, user,
}: {
  open: boolean
  onClose: () => void
  user: Profile
}) {
  const update = useUpdateProfile()
  const sendReset = useSendPasswordReset()
  const { data: classifications = [] } = useClassifications()
  const { data: vehicles = [] } = useVehicles()
  const [resetSent, setResetSent] = useState(false)
  const { data: notifPrefs = {} } = useNotificationPrefs(user.id)
  const upsertPref = useUpsertNotificationPref()

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      is_readonly_admin: user.is_readonly_admin,
      classification_id: user.classification_id,
      default_vehicle_id: user.default_vehicle_id,
      active: user.active,
    },
  })

  const role = watch('role')

  async function onSubmit(data: EditForm) {
    await update.mutateAsync({
      id: user.id,
      ...data,
      classification_id: data.classification_id || null,
      default_vehicle_id: data.default_vehicle_id || null,
      is_readonly_admin: data.role === 'admin' ? data.is_readonly_admin : false,
    })
    onClose()
  }

  async function handleSendReset() {
    await sendReset.mutateAsync(user.email)
    setResetSent(true)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name *</Label>
              <Input {...register('first_name')} />
              {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Last Name *</Label>
              <Input {...register('last_name')} />
              {errors.last_name && <p className="text-xs text-destructive">{errors.last_name.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={watch('role')} onValueChange={v => setValue('role', v as 'user' | 'admin')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === 'admin' && (
            <div className="flex items-center gap-3 rounded-md border p-3">
              <Switch
                id="readonly"
                checked={watch('is_readonly_admin')}
                onCheckedChange={v => setValue('is_readonly_admin', v)}
              />
              <div>
                <Label htmlFor="readonly">Read-only admin</Label>
                <p className="text-xs text-muted-foreground">Can view and export, but cannot edit tickets or set rates.</p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Classification (default for tickets)</Label>
            <Select
              value={watch('classification_id') ?? 'none'}
              onValueChange={v => setValue('classification_id', v === 'none' ? null : v)}
            >
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {classifications.filter(c => c.active).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Default Vehicle</Label>
            <Select
              value={watch('default_vehicle_id') ?? 'none'}
              onValueChange={v => setValue('default_vehicle_id', v === 'none' ? null : v)}
            >
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {vehicles.filter(v => v.active).map(v => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}{v.description ? ` — ${v.description}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="active"
              checked={watch('active')}
              onCheckedChange={v => setValue('active', v)}
            />
            <Label htmlFor="active">Account active</Label>
          </div>

          <div className="rounded-md border p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Password Reset</p>
              <p className="text-xs text-muted-foreground">Send a reset email to this user.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={handleSendReset}
              disabled={sendReset.isPending || resetSent}
            >
              <KeyRound className="h-3.5 w-3.5" />
              {resetSent ? 'Sent!' : sendReset.isPending ? 'Sending…' : 'Send Reset'}
            </Button>
          </div>

          {/* Notification preferences */}
          <div className="rounded-md border p-3 space-y-3">
            <div>
              <p className="text-sm font-medium">Email Notification Preferences</p>
              <p className="text-xs text-muted-foreground">
                In-app notifications (bell) are always on. Defaults to Immediate email.
              </p>
            </div>
            <div className="space-y-3">
              {(role === 'admin' ? ADMIN_NOTIF_PREFS : USER_NOTIF_PREFS).map(({ key, label }) => {
                const pref = notifPrefs[key]
                const freq: EmailFrequency = pref?.email_frequency ?? 'immediate'
                return (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium flex-1 min-w-0 truncate">{label}</p>
                    <FreqSelector
                      value={freq}
                      saving={upsertPref.isPending}
                      size="sm"
                      onChange={v => upsertPref.mutate({ user_id: user.id, key, email_frequency: v })}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---- Disable confirm dialog ----
function DisableUserDialog({
  open, onClose, user,
}: {
  open: boolean
  onClose: () => void
  user: Profile
}) {
  const deleteUser = useDeleteUser()
  const [error, setError] = useState<string | null>(null)

  async function handleDisable() {
    setError(null)
    try {
      await deleteUser.mutateAsync(user.id)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to disable user')
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Disable User</DialogTitle>
          <DialogDescription>
            <strong>{user.first_name} {user.last_name}</strong> ({user.email}) will be marked inactive and immediately lose access to the app. Their tickets and data are preserved.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleDisable} disabled={deleteUser.isPending}>
            {deleteUser.isPending ? 'Disabling…' : 'Disable User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Permanently delete confirm dialog ----
function PermanentDeleteDialog({
  open, onClose, user,
}: {
  open: boolean
  onClose: () => void
  user: Profile
}) {
  const permanentDelete = usePermanentlyDeleteUser()
  const [error, setError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')

  async function handleDelete() {
    setError(null)
    try {
      await permanentDelete.mutateAsync(user.id)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete user')
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setConfirmText('') } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Permanently Delete User</DialogTitle>
          <DialogDescription>
            This will permanently remove <strong>{user.first_name} {user.last_name}</strong> ({user.email}) from the system. Their login will be deleted. Their existing tickets will be preserved but will no longer be linked to this user. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-sm">Type <strong>DELETE</strong> to confirm</Label>
          <Input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="DELETE" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { onClose(); setConfirmText('') }}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={permanentDelete.isPending || confirmText !== 'DELETE'}
          >
            {permanentDelete.isPending ? 'Deleting…' : 'Permanently Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Create user dialog ----
const createSchema = z.object({
  email: z.string().email('Invalid email'),
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  role: z.enum(['user', 'admin']),
  is_readonly_admin: z.boolean(),
  classification_id: z.string().nullable().optional(),
  default_vehicle_id: z.string().nullable().optional(),
})
type CreateForm = z.infer<typeof createSchema>

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createUser = useCreateUser()
  const { data: classifications = [] } = useClassifications()
  const { data: vehicles = [] } = useVehicles()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema) as never,
    defaultValues: { role: 'user', is_readonly_admin: false },
  })

  const role = watch('role')

  async function onSubmit(data: CreateForm) {
    setServerError(null)
    try {
      await createUser.mutateAsync({
        ...data,
        classification_id: data.classification_id || null,
        default_vehicle_id: data.default_vehicle_id || null,
      })
      reset()
      onClose()
    } catch (e: unknown) {
      setServerError(e instanceof Error ? e.message : 'Failed to create user')
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add User</DialogTitle>
          <DialogDescription>
            Creates an account and emails the user a password reset link so they can set their password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input type="email" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name *</Label>
              <Input {...register('first_name')} />
              {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Last Name *</Label>
              <Input {...register('last_name')} />
              {errors.last_name && <p className="text-xs text-destructive">{errors.last_name.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={watch('role')} onValueChange={v => setValue('role', v as 'user' | 'admin')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {role === 'admin' && (
            <div className="flex items-center gap-3 rounded-md border p-3">
              <Switch
                id="inv-readonly"
                checked={watch('is_readonly_admin')}
                onCheckedChange={v => setValue('is_readonly_admin', v)}
              />
              <div>
                <Label htmlFor="inv-readonly">Read-only admin</Label>
                <p className="text-xs text-muted-foreground">View and export only.</p>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Classification</Label>
            <Select
              value={watch('classification_id') ?? 'none'}
              onValueChange={v => setValue('classification_id', v === 'none' ? null : v)}
            >
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {classifications.filter(c => c.active).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Default Vehicle</Label>
            <Select
              value={watch('default_vehicle_id') ?? 'none'}
              onValueChange={v => setValue('default_vehicle_id', v === 'none' ? null : v)}
            >
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {vehicles.filter(v => v.active).map(v => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}{v.description ? ` — ${v.description}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? 'Creating…' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---- Main page ----
export function AdminUsersPage() {
  const { profile: currentUser } = useAuth()
  const { data: users = [], isLoading, isError, error } = useProfiles()
  if (isError) console.error('[AdminUsersPage] useProfiles error:', error)
  const { data: vehicles = [] } = useVehicles()
  const vehicleMap = useMemo(() => new Map(vehicles.map(v => [v.id, v.label])), [vehicles])
  const reactivate = useReactivateUser()
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [disabling, setDisabling] = useState<Profile | null>(null)
  const [permDeleting, setPermDeleting] = useState<Profile | null>(null)

  function roleBadge(u: Profile) {
    if (u.role === 'admin') {
      return u.is_readonly_admin
        ? <Badge variant="outline">Admin (read-only)</Badge>
        : <Badge variant="default">Admin</Badge>
    }
    return <Badge variant="secondary">User</Badge>
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground text-sm">Manage team members and permissions</p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-14 text-destructive gap-2">
              <Users className="h-8 w-8 opacity-30" />
              <p className="text-sm">Failed to load users: {error instanceof Error ? error.message : 'Unknown error'}</p>
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2">
              <Users className="h-8 w-8 opacity-30" />
              <p className="text-sm">No users yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden sm:table-cell">Classification</TableHead>
                  <TableHead className="hidden lg:table-cell">Vehicle</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.first_name} {u.last_name}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                      {u.email}
                    </TableCell>
                    <TableCell>{roleBadge(u)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {(u as unknown as { classifications: { name: string } | null }).classifications?.name ?? '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                      {u.default_vehicle_id ? (vehicleMap.get(u.default_vehicle_id) ?? '—') : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.active ? 'success' : 'outline'}>
                        {u.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditing(u)}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        {u.id !== currentUser?.id && u.active && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            title="Disable user"
                            onClick={() => setDisabling(u)}
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {u.id !== currentUser?.id && !u.active && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-green-600 hover:text-green-700 gap-1.5"
                              onClick={() => reactivate.mutate(u.id)}
                              disabled={reactivate.isPending}
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Re-enable
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              title="Permanently delete"
                              onClick={() => setPermDeleting(u)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {editing && (
        <EditUserDialog open={!!editing} onClose={() => setEditing(null)} user={editing} />
      )}
      {disabling && (
        <DisableUserDialog open={!!disabling} onClose={() => setDisabling(null)} user={disabling} />
      )}
      {permDeleting && (
        <PermanentDeleteDialog open={!!permDeleting} onClose={() => setPermDeleting(null)} user={permDeleting} />
      )}
    </div>
  )
}
