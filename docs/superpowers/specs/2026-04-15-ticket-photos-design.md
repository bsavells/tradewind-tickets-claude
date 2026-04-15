# Ticket Photos — Design Spec

**Date:** 2026-04-15
**Status:** Approved

## Overview

Field technicians and admins can attach up to 10 photos per ticket. Photos support optional captions. Techs upload during ticket creation/editing (draft and returned states). Admins can upload at any time. Photos are visible in read-only mode (tech detail page, admin review page) via a grid + lightbox UI.

## Decisions Made

| Question | Decision |
|---|---|
| Max photos | 10 (configurable constant `MAX_TICKET_PHOTOS`) |
| Captions | Optional per-photo text field |
| Who uploads | Both techs (draft/returned) and writable admins (any status) |
| Upload timing | Immediate on file selection |
| New ticket (no ID yet) | Auto-save draft on first photo add |
| Upload form layout | Drop zone + vertical list with inline captions |
| Read-only layout | 3–4 col grid + Dialog-based lightbox |
| Camera support | Yes — dedicated `capture="environment"` input + standard file picker |
| Formats accepted | `image/*` (JPEG, PNG, HEIC, WebP) |
| Max file size | 10MB per file (validated client-side) |
| Storage bucket | `ticket-photos` (private) |
| Storage path | `{company_id}/{ticket_id}/{uuid}.{ext}` |
| Signed URL TTL | 1 hour (refetched on query invalidation) |
| Thumbnails | No server-side thumbnails — full image with CSS `object-fit: cover` |
| Delete confirmation | None (low-stakes, ticket not deleted) |
| Toast library | None in project — use inline error state |

## Out of Scope

- Reordering photos (drag-and-drop)
- Video attachments
- Server-side thumbnail generation
- Customer signatures (separate feature)

## Data Model

Table `ticket_photos` (already exists in schema):

```sql
id             uuid pk
ticket_id      uuid → tickets(id) on delete cascade
file_url       text  -- full Supabase Storage path (not signed URL)
thumbnail_url  text  -- null (not used yet)
caption        text  -- optional
uploaded_by    uuid → profiles(id)
uploaded_at    timestamptz
```

RLS already in schema:
- SELECT: ticket creator or any admin in same company
- ALL (write): ticket creator when `status in ('draft','returned')`, or writable admin in same company

## Storage

**Bucket:** `ticket-photos` (private, 10MB limit, `image/*` only)

**Path pattern:** `{company_id}/{ticket_id}/{uuid}.{ext}`

**Storage policies** (new migration):
- SELECT: `auth.role() = 'authenticated'` and path prefix matches `auth_company_id()`
- INSERT: same
- DELETE: same

Simpler than replicating ticket status checks in storage — the `ticket_photos` table RLS acts as the true gatekeeper. Storage policies just enforce company isolation.

## File Structure

### New files

| File | Responsibility |
|---|---|
| `src/hooks/useTicketPhotos.ts` | All photo data: fetch with signed URLs, upload, delete, caption update |
| `src/components/PhotoGallery.tsx` | Read-only grid + Dialog lightbox. Pure display, no mutations. |
| `src/components/PhotoUploader.tsx` | Drop zone + list with upload/delete/caption. Calls `onAutoSave` for new tickets. |
| `supabase/migrations/20260415000001_ticket_photos_storage.sql` | Storage bucket creation + policies |

### Modified files

| File | Change |
|---|---|
| `src/lib/database.types.ts` | Already has `ticket_photos` — verify types match |
| `src/pages/tech/TicketFormPage.tsx` | Replace placeholder card with `<PhotoUploader>` |
| `src/pages/tech/TicketDetailPage.tsx` | Add `<PhotoGallery>` section |
| `src/pages/admin/AdminTicketReviewPage.tsx` | Add `<PhotoUploader canEdit={isWritableAdmin}>` section |

## Component Interfaces

### `PhotoUploader`

```tsx
interface PhotoUploaderProps {
  ticketId: string | undefined       // undefined = new unsaved ticket
  canEdit: boolean                   // false = renders PhotoGallery instead
  onAutoSave: () => Promise<string>  // called when ticketId is undefined; returns new ticket ID
}
```

When `canEdit` is false, renders `<PhotoGallery ticketId={ticketId} />` directly.
When `ticketId` is undefined and user adds a photo, calls `onAutoSave()`, then proceeds with upload using the returned ID.

### `PhotoGallery`

```tsx
interface PhotoGalleryProps {
  ticketId: string
}
```

Fetches photos via `useTicketPhotos(ticketId)`. Shows grid → lightbox. No mutations.

### `useTicketPhotos` hooks

```ts
useTicketPhotos(ticketId: string | undefined)
  // returns: { photos: TicketPhoto[], isLoading, error }
  // photos have `signedUrl` added at fetch time

useUploadPhoto()
  // mutationFn: ({ ticketId, file, caption }: UploadPhotoArgs) => Promise<TicketPhoto>

useDeletePhoto()
  // mutationFn: ({ photoId, filePath }: DeletePhotoArgs) => Promise<void>

useUpdatePhotoCaption()
  // mutationFn: ({ photoId, caption }: UpdateCaptionArgs) => Promise<void>
```

## Upload Flow (detailed)

1. User selects file (drop, file picker, or camera)
2. **Client-side validation:** size ≤ 10MB and `file.type.startsWith('image/')` — show inline error if invalid, stop
3. If `ticketId` is undefined: call `onAutoSave()` → get new `ticketId`, navigate URL to `/tickets/{id}/edit`
4. Generate `uuid` for filename, derive extension from MIME type
5. `supabase.storage.from('ticket-photos').upload('{company_id}/{ticketId}/{uuid}.{ext}', file)`
6. On success: insert row to `ticket_photos` with `file_url = path` (not signed URL)
7. Invalidate `['ticket-photos', ticketId]` query → triggers refetch with fresh signed URLs
8. On any error: show inline error message, remove optimistic item from list

## Read-Only Display Flow

1. `useTicketPhotos` fetches `ticket_photos` rows for ticket
2. For each row, calls `supabase.storage.from('ticket-photos').createSignedUrl(row.file_url, 3600)`
3. Returns array with `signedUrl` attached
4. `PhotoGallery` renders 3-col (mobile) / 4-col (desktop) grid
5. Caption overlays bottom of thumbnail (dark gradient) if caption is set
6. Click → `Dialog` opens with full image, caption below, `"N / total"` counter, prev/next arrows, ESC to close
7. Keyboard: `ArrowLeft`/`ArrowRight` to navigate, `Escape` to close

## Auto-Save Behavior

`TicketFormPage` provides `onAutoSave`:

```ts
async function handleAutoSave(): Promise<string> {
  const data = getValues() as unknown as TicketFormData
  const ticket = await createTicket.mutateAsync(data)
  await clearDraft('new')
  navigate(`/tickets/${ticket.id}/edit`, { replace: true })
  return ticket.id
}
```

This is identical to the existing save flow for new tickets, minus the final redirect to `/tickets`. After `onAutoSave` resolves, the `PhotoUploader` proceeds to upload using the new `ticketId`.

## Empty States

- **No photos, can edit:** Drop zone is the primary UI
- **No photos, read-only:** `"No photos attached"` muted text (section still visible)
- **Loading:** Spinner (matches app patterns)

## Error Handling

| Error | UX |
|---|---|
| File too large | Inline text below the drop zone: "filename.jpg is too large (max 10 MB)" |
| Wrong type | Inline: "Only image files are accepted" |
| Upload fails | Inline error, optimistic item removed |
| Delete fails | Inline error, photo stays |
| Caption save fails | Field border turns red, reverts to last saved value on blur |
| Signed URL fetch fails | Photo shows broken-image placeholder, no crash |

## Migration

New file: `supabase/migrations/20260415000001_ticket_photos_storage.sql`

```sql
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

-- Storage RLS: company-scoped access
-- True authz is on ticket_photos table; storage just enforces company isolation
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
