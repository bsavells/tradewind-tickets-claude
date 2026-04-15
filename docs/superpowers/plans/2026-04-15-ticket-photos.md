# Ticket Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow techs and admins to attach up to 10 photos per ticket, with optional captions, immediate upload to Supabase Storage, and a grid+lightbox read-only view.

**Architecture:** Three new files (`useTicketPhotos` hook, `PhotoGallery` read-only component, `PhotoUploader` upload component) wired into three existing pages. Storage bucket created via migration. Auto-save draft triggered when a new ticket's first photo is added.

**Tech Stack:** React, TypeScript, Supabase Storage (signed URLs), shadcn/ui Dialog (lightbox), TanStack Query

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/20260415000001_ticket_photos_storage.sql` | **Create** | Storage bucket + RLS policies |
| `src/hooks/useTicketPhotos.ts` | **Create** | Fetch (with signed URLs), upload, delete, caption update |
| `src/components/PhotoGallery.tsx` | **Create** | Read-only 3–4 col grid + Dialog lightbox |
| `src/components/PhotoUploader.tsx` | **Create** | Drop zone + list UI, calls hooks, handles auto-save |
| `src/pages/tech/TicketFormPage.tsx` | **Modify** | Replace placeholder card with `<PhotoUploader>`, expose `onAutoSave` |
| `src/pages/tech/TicketDetailPage.tsx` | **Modify** | Add `<PhotoGallery>` section before action buttons |
| `src/pages/admin/AdminTicketReviewPage.tsx` | **Modify** | Add `<PhotoUploader canEdit={isWritableAdmin}>` section |

---

## Task 1: Storage Migration

**Files:**
- Create: `supabase/migrations/20260415000001_ticket_photos_storage.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260415000001_ticket_photos_storage.sql

-- Create ticket-photos storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-photos',
  'ticket-photos',
  false,
  10485760,
  array['image/jpeg','image/png','image/heic','image/heif','image/webp']
)
on conflict (id) do nothing;

-- Storage RLS policies (company-scoped)
-- Table-level RLS on ticket_photos is the true authz gatekeeper.
-- Storage policies enforce company isolation only.

create policy "ticket-photos select" on storage.objects
  for select using (
    bucket_id = 'ticket-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (auth_company_id())::text
  );

create policy "ticket-photos insert" on storage.objects
  for insert with check (
    bucket_id = 'ticket-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (auth_company_id())::text
  );

create policy "ticket-photos delete" on storage.objects
  for delete using (
    bucket_id = 'ticket-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (auth_company_id())::text
  );
```

- [ ] **Step 2: Apply migration**

Run in terminal from project root:
```bash
npx supabase db push
```

Expected output: migration applied, no errors.

- [ ] **Step 3: Verify bucket exists in Supabase dashboard**

Go to Supabase Dashboard → Storage. Confirm `ticket-photos` bucket is listed as private.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260415000001_ticket_photos_storage.sql
git commit -m "Add ticket-photos storage bucket and RLS policies"
```

---

## Task 2: `useTicketPhotos` Hook

**Files:**
- Create: `src/hooks/useTicketPhotos.ts`

The hook fetches `ticket_photos` rows and generates 1-hour signed URLs for each. Separate mutation hooks handle upload, delete, and caption updates.

- [ ] **Step 1: Create the hook file**

```typescript
// src/hooks/useTicketPhotos.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const BUCKET = 'ticket-photos'
export const MAX_TICKET_PHOTOS = 10

export interface TicketPhoto {
  id: string
  ticket_id: string
  file_url: string       // storage path, e.g. "{company_id}/{ticket_id}/{uuid}.jpg"
  caption: string | null
  uploaded_by: string
  uploaded_at: string
  signedUrl: string      // 1-hour signed URL for display
}

// ── Fetch photos with signed URLs ────────────────────────────────────────────
export function useTicketPhotos(ticketId: string | undefined) {
  return useQuery({
    queryKey: ['ticket-photos', ticketId],
    queryFn: async (): Promise<TicketPhoto[]> => {
      const { data, error } = await supabase
        .from('ticket_photos')
        .select('*')
        .eq('ticket_id', ticketId!)
        .order('uploaded_at', { ascending: true })
      if (error) throw error

      // Generate signed URLs in parallel
      const withUrls = await Promise.all(
        (data ?? []).map(async (row) => {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(row.file_url, 3600)
          return {
            ...row,
            signedUrl: signed?.signedUrl ?? '',
          } as TicketPhoto
        })
      )
      return withUrls
    },
    enabled: !!ticketId,
  })
}

// ── Upload a photo ────────────────────────────────────────────────────────────
export function useUploadPhoto() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      ticketId,
      file,
      caption,
    }: {
      ticketId: string
      file: File
      caption?: string
    }): Promise<TicketPhoto> => {
      // Derive extension from MIME type
      const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
      const uuid = crypto.randomUUID()
      const path = `${profile!.company_id}/${ticketId}/${uuid}.${ext}`

      // Upload to storage
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false })
      if (uploadErr) throw uploadErr

      // Insert DB row
      const { data: row, error: insertErr } = await supabase
        .from('ticket_photos')
        .insert({
          ticket_id: ticketId,
          file_url: path,
          caption: caption || null,
          uploaded_by: profile!.id,
        })
        .select()
        .single()
      if (insertErr) {
        // Best-effort cleanup of orphaned storage file
        await supabase.storage.from(BUCKET).remove([path])
        throw insertErr
      }

      // Get signed URL for immediate display
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600)

      return { ...row, signedUrl: signed?.signedUrl ?? '' } as TicketPhoto
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ['ticket-photos', ticketId] })
    },
  })
}

// ── Delete a photo ────────────────────────────────────────────────────────────
export function useDeletePhoto() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      photoId,
      ticketId,
      filePath,
    }: {
      photoId: string
      ticketId: string
      filePath: string
    }) => {
      // Delete DB row first
      const { error: dbErr } = await supabase
        .from('ticket_photos')
        .delete()
        .eq('id', photoId)
      if (dbErr) throw dbErr

      // Delete from storage (best-effort — DB row already gone)
      await supabase.storage.from(BUCKET).remove([filePath])
      return ticketId
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ['ticket-photos', ticketId] })
    },
  })
}

// ── Update caption ────────────────────────────────────────────────────────────
export function useUpdatePhotoCaption() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      photoId,
      ticketId,
      caption,
    }: {
      photoId: string
      ticketId: string
      caption: string
    }) => {
      const { error } = await supabase
        .from('ticket_photos')
        .update({ caption: caption || null })
        .eq('id', photoId)
      if (error) throw error
      return ticketId
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ['ticket-photos', ticketId] })
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "C:\Users\brian\Documents\Claude\Projects\Tradewind Tickets"
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTicketPhotos.ts
git commit -m "Add useTicketPhotos hook (fetch, upload, delete, caption)"
```

---

## Task 3: `PhotoGallery` Component (Read-Only Grid + Lightbox)

**Files:**
- Create: `src/components/PhotoGallery.tsx`

- [ ] **Step 1: Create PhotoGallery**

```tsx
// src/components/PhotoGallery.tsx
import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, X, ImageIcon } from 'lucide-react'
import { useTicketPhotos, type TicketPhoto } from '@/hooks/useTicketPhotos'
import { cn } from '@/lib/utils'

interface PhotoGalleryProps {
  ticketId: string
}

export function PhotoGallery({ ticketId }: PhotoGalleryProps) {
  const { data: photos = [], isLoading } = useTicketPhotos(ticketId)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const open = lightboxIndex !== null
  const current = lightboxIndex !== null ? photos[lightboxIndex] : null

  const prev = useCallback(() => {
    setLightboxIndex(i => (i !== null ? (i - 1 + photos.length) % photos.length : null))
  }, [photos.length])

  const next = useCallback(() => {
    setLightboxIndex(i => (i !== null ? (i + 1) % photos.length : null))
  }, [photos.length])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, prev, next])

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <ImageIcon className="h-4 w-4" />
        No photos attached
      </div>
    )
  }

  return (
    <>
      {/* Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {photos.map((photo, idx) => (
          <PhotoThumb
            key={photo.id}
            photo={photo}
            onClick={() => setLightboxIndex(idx)}
          />
        ))}
      </div>

      {/* Lightbox */}
      <Dialog open={open} onOpenChange={v => { if (!v) setLightboxIndex(null) }}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black border-0">
          <div className="relative flex flex-col">
            {/* Close + counter */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-3">
              <span className="text-white/70 text-sm">
                {lightboxIndex !== null ? lightboxIndex + 1 : 0} / {photos.length}
              </span>
              <button
                onClick={() => setLightboxIndex(null)}
                className="text-white/70 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Image */}
            <div className="flex items-center justify-center min-h-[50vh] max-h-[70vh] bg-black">
              {current?.signedUrl ? (
                <img
                  src={current.signedUrl}
                  alt={current.caption ?? 'Ticket photo'}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-64">
                  <ImageIcon className="h-12 w-12 text-white/20" />
                </div>
              )}
            </div>

            {/* Caption + nav */}
            <div className="bg-black/90 px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                {current?.caption ? (
                  <p className="text-white/90 text-sm truncate">{current.caption}</p>
                ) : (
                  <p className="text-white/30 text-sm italic">No caption</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={prev}
                  disabled={photos.length <= 1}
                  className="text-white/70 hover:text-white disabled:opacity-30 transition-colors p-1"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={next}
                  disabled={photos.length <= 1}
                  className="text-white/70 hover:text-white disabled:opacity-30 transition-colors p-1"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function PhotoThumb({ photo, onClick }: { photo: TicketPhoto; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-square rounded-md overflow-hidden bg-muted group focus-visible:ring-2 focus-visible:ring-primary"
    >
      {photo.signedUrl ? (
        <img
          src={photo.signedUrl}
          alt={photo.caption ?? 'Ticket photo'}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
        </div>
      )}
      {photo.caption && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1">
          <p className="text-white text-[10px] truncate">{photo.caption}</p>
        </div>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/PhotoGallery.tsx
git commit -m "Add PhotoGallery component (read-only grid + lightbox)"
```

---

## Task 4: `PhotoUploader` Component

**Files:**
- Create: `src/components/PhotoUploader.tsx`

- [ ] **Step 1: Create PhotoUploader**

```tsx
// src/components/PhotoUploader.tsx
import { useRef, useState, useCallback } from 'react'
import { Upload, Camera, Trash2, ImageIcon, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useTicketPhotos,
  useUploadPhoto,
  useDeletePhoto,
  useUpdatePhotoCaption,
  MAX_TICKET_PHOTOS,
  type TicketPhoto,
} from '@/hooks/useTicketPhotos'
import { PhotoGallery } from '@/components/PhotoGallery'

interface PhotoUploaderProps {
  ticketId: string | undefined
  canEdit: boolean
  onAutoSave: () => Promise<string>
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export function PhotoUploader({ ticketId, canEdit, onAutoSave }: PhotoUploaderProps) {
  // Read-only mode
  if (!canEdit) {
    if (!ticketId) return null
    return <PhotoGallery ticketId={ticketId} />
  }

  return <PhotoUploaderInner ticketId={ticketId} onAutoSave={onAutoSave} />
}

function PhotoUploaderInner({
  ticketId,
  onAutoSave,
}: {
  ticketId: string | undefined
  onAutoSave: () => Promise<string>
}) {
  const { data: photos = [], isLoading } = useTicketPhotos(ticketId)
  const uploadPhoto = useUploadPhoto()
  const deletePhoto = useDeletePhoto()
  const updateCaption = useUpdatePhotoCaption()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [captionErrors, setCaptionErrors] = useState<Record<string, string>>({})

  const atLimit = photos.length >= MAX_TICKET_PHOTOS

  async function resolveTicketId(): Promise<string | null> {
    if (ticketId) return ticketId
    try {
      return await onAutoSave()
    } catch {
      setUploadError('Failed to save draft before uploading. Please try saving the form first.')
      return null
    }
  }

  function validateFile(file: File): string | null {
    if (!file.type.startsWith('image/')) return 'Only image files are accepted.'
    if (file.size > MAX_FILE_SIZE) {
      const mb = (file.size / 1024 / 1024).toFixed(1)
      return `${file.name} is too large (${mb} MB — max 10 MB).`
    }
    return null
  }

  async function handleFiles(files: FileList | File[]) {
    setUploadError(null)
    const fileArr = Array.from(files)
    if (fileArr.length === 0) return

    const file = fileArr[0] // one at a time
    const validationError = validateFile(file)
    if (validationError) {
      setUploadError(validationError)
      return
    }

    if (photos.length >= MAX_TICKET_PHOTOS) {
      setUploadError(`Maximum ${MAX_TICKET_PHOTOS} photos allowed.`)
      return
    }

    const tid = await resolveTicketId()
    if (!tid) return

    setUploading(true)
    try {
      await uploadPhoto.mutateAsync({ ticketId: tid, file })
    } catch {
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      handleFiles(e.dataTransfer.files)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photos.length, ticketId]
  )

  async function handleDelete(photo: TicketPhoto) {
    try {
      await deletePhoto.mutateAsync({
        photoId: photo.id,
        ticketId: photo.ticket_id,
        filePath: photo.file_url,
      })
    } catch {
      // Error is surfaced inline per-photo — no global error needed
    }
  }

  async function handleCaptionBlur(photo: TicketPhoto, value: string) {
    if (value === (photo.caption ?? '')) return // no change
    try {
      await updateCaption.mutateAsync({
        photoId: photo.id,
        ticketId: photo.ticket_id,
        caption: value,
      })
      setCaptionErrors(prev => ({ ...prev, [photo.id]: '' }))
    } catch {
      setCaptionErrors(prev => ({ ...prev, [photo.id]: 'Failed to save caption.' }))
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Drop zone — hidden when at limit */}
      {!atLimit && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/30'
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Uploading…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Upload className="h-6 w-6 opacity-50" />
              <p className="text-sm">Drag & drop or tap to upload</p>
              <p className="text-xs text-muted-foreground/60">JPEG, PNG, HEIC · Max 10 MB each</p>
            </div>
          )}
        </div>
      )}

      {/* File inputs (hidden) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />

      {/* Action buttons */}
      {!atLimit && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 flex-1"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Choose File
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 flex-1"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="h-3.5 w-3.5" />
            Camera
          </Button>
        </div>
      )}

      {/* Photo count */}
      <p className={cn(
        'text-xs',
        atLimit ? 'text-amber-600 font-medium' : 'text-muted-foreground'
      )}>
        {photos.length} / {MAX_TICKET_PHOTOS} photos
        {atLimit && ' — limit reached'}
      </p>

      {/* Upload error */}
      {uploadError && (
        <div className="flex items-start gap-2 text-destructive text-xs">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {uploadError}
        </div>
      )}

      {/* Photo list */}
      {photos.length > 0 && (
        <div className="space-y-2">
          {photos.map(photo => (
            <PhotoRow
              key={photo.id}
              photo={photo}
              onDelete={() => handleDelete(photo)}
              onCaptionBlur={(v) => handleCaptionBlur(photo, v)}
              captionError={captionErrors[photo.id]}
              deleting={deletePhoto.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PhotoRow({
  photo,
  onDelete,
  onCaptionBlur,
  captionError,
  deleting,
}: {
  photo: TicketPhoto
  onDelete: () => void
  onCaptionBlur: (value: string) => void
  captionError?: string
  deleting: boolean
}) {
  const [caption, setCaption] = useState(photo.caption ?? '')

  return (
    <div className="flex gap-3 items-start p-3 rounded-lg border bg-muted/30">
      {/* Thumbnail */}
      <div className="w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0">
        {photo.signedUrl ? (
          <img src={photo.signedUrl} alt={photo.caption ?? 'Photo'} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Caption field */}
      <div className="flex-1 min-w-0 space-y-1">
        <label className="text-xs text-muted-foreground">Caption (optional)</label>
        <input
          type="text"
          value={caption}
          onChange={e => setCaption(e.target.value)}
          onBlur={e => onCaptionBlur(e.target.value)}
          placeholder="e.g. Before repair"
          className={cn(
            'w-full text-sm bg-background border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary',
            captionError ? 'border-destructive' : 'border-border'
          )}
        />
        {captionError && (
          <p className="text-xs text-destructive">{captionError}</p>
        )}
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="text-muted-foreground hover:text-destructive transition-colors mt-1 shrink-0"
        title="Remove photo"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/PhotoUploader.tsx
git commit -m "Add PhotoUploader component (drop zone + list, auto-save for new tickets)"
```

---

## Task 5: Wire Into `TicketFormPage`

**Files:**
- Modify: `src/pages/tech/TicketFormPage.tsx`

- [ ] **Step 1: Add imports near the top of TicketFormPage**

Find the existing import block and add:
```tsx
import { PhotoUploader } from '@/components/PhotoUploader'
```

- [ ] **Step 2: Add `handleAutoSave` function** inside the component body, after the existing `onSubmit` function:

```tsx
async function handleAutoSave(): Promise<string> {
  const data = getValues() as unknown as TicketFormData
  const ticket = await createTicket.mutateAsync(data)
  await clearDraft('new')
  navigate(`/tickets/${ticket.id}/edit`, { replace: true })
  return ticket.id
}
```

- [ ] **Step 3: Replace the placeholder Photos card**

Find this block:
```tsx
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
```

Replace with:
```tsx
{/* ---- Photos ---- */}
<Card>
  <CardHeader className="pb-3">
    <CardTitle className="text-base">Photos</CardTitle>
  </CardHeader>
  <CardContent>
    <PhotoUploader
      ticketId={id}
      canEdit={true}
      onAutoSave={handleAutoSave}
    />
  </CardContent>
</Card>
```

- [ ] **Step 4: Remove unused `Camera` import** if it's no longer used elsewhere in the file:

Check if `Camera` is used anywhere else in `TicketFormPage.tsx`. If not, remove it from the lucide-react import line.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/tech/TicketFormPage.tsx
git commit -m "Wire PhotoUploader into TicketFormPage, replace placeholder"
```

---

## Task 6: Wire Into `TicketDetailPage`

**Files:**
- Modify: `src/pages/tech/TicketDetailPage.tsx`

The tech detail page is read-only — use `PhotoGallery` directly.

- [ ] **Step 1: Add import**

```tsx
import { PhotoGallery } from '@/components/PhotoGallery'
```

- [ ] **Step 2: Add Photos section**

Find the last `</Card>` before the action button row at the bottom. Add after it:

```tsx
{/* Photos */}
<Card>
  <CardHeader className="pb-2">
    <CardTitle className="text-sm">Photos</CardTitle>
  </CardHeader>
  <CardContent>
    <PhotoGallery ticketId={t.id} />
  </CardContent>
</Card>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/tech/TicketDetailPage.tsx
git commit -m "Add PhotoGallery to TicketDetailPage (read-only)"
```

---

## Task 7: Wire Into `AdminTicketReviewPage`

**Files:**
- Modify: `src/pages/admin/AdminTicketReviewPage.tsx`

Admins see `PhotoUploader`. Writable admins can add/delete; read-only admins see gallery.

- [ ] **Step 1: Add import**

```tsx
import { PhotoUploader } from '@/components/PhotoUploader'
```

- [ ] **Step 2: Add Photos section**

In `AdminTicketReviewPage`, find the closing section before the action buttons at the bottom (look for the Return/Finalize/Delete button area). Add the Photos card above it:

```tsx
{/* Photos */}
<Card>
  <CardHeader className="pb-3">
    <CardTitle className="text-base">Photos</CardTitle>
  </CardHeader>
  <CardContent>
    <PhotoUploader
      ticketId={t.id}
      canEdit={isWritableAdmin}
      onAutoSave={async () => t.id}
    />
  </CardContent>
</Card>
```

Note: `onAutoSave` returns `t.id` directly since the admin review page always has an existing ticket — no auto-save needed.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/AdminTicketReviewPage.tsx
git commit -m "Add PhotoUploader to AdminTicketReviewPage"
```

---

## Task 8: Full Build + Push

- [ ] **Step 1: Full production build**

```bash
npm run build 2>&1
```

Expected: build succeeds with no TypeScript errors. (Chunk size warning for index.js is acceptable.)

- [ ] **Step 2: Manual smoke test checklist**

Test the following flows in the running dev server (`npm run dev`):

1. **New ticket → add photo** — opens camera/file picker, auto-saves draft, uploads photo, appears in list
2. **Existing draft → add photo** — uploads immediately without auto-save
3. **Caption** — type caption, click away, reload page — caption persists
4. **Delete photo** — photo removed from list and storage
5. **Limit** — add 10 photos — drop zone and buttons disable, "limit reached" shown
6. **Submit ticket → detail view** — photos appear in grid, click opens lightbox, arrows navigate, ESC closes
7. **Admin review page** — photos visible, writable admin can add/delete, read-only admin cannot
8. **Large file** — try uploading a file > 10MB — inline error shown, no upload attempted

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Verify Vercel deployment**

Check Vercel dashboard — new deployment triggered, status "Ready".

---

## .gitignore Update

- [ ] Add `.superpowers/` to `.gitignore` if not already present:

```bash
grep -q ".superpowers" .gitignore || echo ".superpowers/" >> .gitignore
git add .gitignore
git commit -m "Ignore .superpowers/ brainstorm artifacts"
```
