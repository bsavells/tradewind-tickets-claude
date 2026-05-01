import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { enqueue as enqueueSync } from '@/lib/syncQueue'
import type { QueuedResult } from '@/hooks/useTickets'

const BUCKET = 'ticket-photos'

function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (err as any)?.status
  if (typeof status === 'number') {
    return status >= 500 || status === 408 || status === 429 || status === 0
  }
  const msg = String((err as Error)?.message ?? '').toLowerCase()
  return msg.includes('network') || msg.includes('failed to fetch') || msg.includes('timeout')
}
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
    }): Promise<QueuedResult<TicketPhoto>> => {
      const queueOp = () => enqueueSync({
        kind: 'photo_upload',
        ticketId,
        // Stash a Blob copy — File extends Blob and IDB serializes it natively.
        blob: file,
        mimeType: file.type,
        caption,
        companyId: profile!.company_id,
        actorId: profile!.id,
      })

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await queueOp()
        return { queued: true }
      }

      try {
        const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
        const uuid = crypto.randomUUID()
        const path = `${profile!.company_id}/${ticketId}/${uuid}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false })
        if (uploadErr) throw uploadErr

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
          await supabase.storage.from(BUCKET).remove([path])
          throw insertErr
        }

        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, 3600)

        return { ...row, signedUrl: signed?.signedUrl ?? '' } as TicketPhoto
      } catch (err) {
        if (isRetryableError(err)) {
          await queueOp()
          return { queued: true }
        }
        throw err
      }
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
