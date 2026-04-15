import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const BUCKET = 'ticket-signatures'

export interface TicketSignature {
  id: string
  ticket_id: string
  kind: 'customer' | 'supervisor'
  signer_name: string | null
  signed_at: string
  image_url: string
  signedUrl: string
}

// ── Fetch the customer signature for a ticket ─────────────────────────────────
export function useTicketSignature(ticketId: string | undefined) {
  return useQuery({
    queryKey: ['ticket-signature', ticketId],
    queryFn: async (): Promise<TicketSignature | null> => {
      const { data, error } = await supabase
        .from('ticket_signatures')
        .select('*')
        .eq('ticket_id', ticketId!)
        .eq('kind', 'customer')
        .maybeSingle()
      if (error) throw error
      if (!data) return null

      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(data.image_url, 3600)

      return { ...data, signedUrl: signed?.signedUrl ?? '' } as TicketSignature
    },
    enabled: !!ticketId,
    // Always refetch on mount — the customer may have signed via email
    // between page visits, and the stale cache would hide the signature.
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

// ── Upload on-site signature (authenticated user) ─────────────────────────────
export function useUploadSignature() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      ticketId,
      signerName,
      blob,
    }: {
      ticketId: string
      signerName: string
      blob: Blob
    }): Promise<TicketSignature> => {
      const path = `${profile!.company_id}/${ticketId}/customer.png`

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: 'image/png', upsert: true })
      if (uploadErr) throw uploadErr

      const { data: row, error: upsertErr } = await supabase
        .from('ticket_signatures')
        .upsert(
          {
            ticket_id: ticketId,
            kind: 'customer',
            signer_name: signerName,
            signed_at: new Date().toISOString(),
            image_url: path,
          },
          { onConflict: 'ticket_id,kind' }
        )
        .select()
        .single()
      if (upsertErr) throw upsertErr

      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600)

      return { ...row, signedUrl: signed?.signedUrl ?? '' } as TicketSignature
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ['ticket-signature', ticketId] })
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
      qc.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

// ── Request a remote signature token via edge function ────────────────────────
export function useRequestSignatureToken() {
  const { session } = useAuth()

  return useMutation({
    mutationFn: async ({
      ticketId,
      customerEmail,
    }: {
      ticketId: string
      customerEmail: string
    }) => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-signature-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session!.access_token}`,
          },
          body: JSON.stringify({ ticket_id: ticketId, customer_email: customerEmail }),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Failed to send signature request')
      }
    },
  })
}
