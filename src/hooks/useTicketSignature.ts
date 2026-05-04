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
      reason,
    }: {
      ticketId: string
      signerName: string
      blob: Blob
      /** Optional reason carried from a re-sign prompt; saved on the audit entry. */
      reason?: string
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

      // Audit entry — best-effort, doesn't block the success path.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: auditErr } = await (supabase.from('ticket_audit_log') as any).insert({
        ticket_id: ticketId,
        actor_id: profile!.id,
        actor_name: `${profile!.first_name} ${profile!.last_name}`,
        action: 'signature_captured',
        note: reason?.trim() || `Signed by ${signerName}`,
      })
      if (auditErr) console.warn('[audit] signature_captured failed:', auditErr)

      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600)

      return { ...row, signedUrl: signed?.signedUrl ?? '' } as TicketSignature
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ['ticket-signature', ticketId] })
      qc.invalidateQueries({ queryKey: ['ticket-signature-clear', ticketId] })
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
      qc.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

// ── Clear an existing signature ──────────────────────────────────────────────
export function useClearSignature() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ ticketId, reason }: { ticketId: string; reason?: string }) => {
      // Delete the DB row (storage file can stay — it'll be overwritten on re-sign)
      const { error } = await supabase
        .from('ticket_signatures')
        .delete()
        .eq('ticket_id', ticketId)
        .eq('kind', 'customer')
      if (error) throw error

      // Audit entry — best-effort. The re-sign banner reads this entry's
      // note as the auto-fill reason.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: auditErr } = await (supabase.from('ticket_audit_log') as any).insert({
        ticket_id: ticketId,
        actor_id: profile?.id ?? null,
        actor_name: profile ? `${profile.first_name} ${profile.last_name}` : null,
        action: 'signature_cleared',
        note: reason?.trim() || 'Cleared manually',
      })
      if (auditErr) console.warn('[audit] signature_cleared failed:', auditErr)
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ['ticket-signature', ticketId] })
      qc.invalidateQueries({ queryKey: ['ticket-signature-clear', ticketId] })
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
      qc.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

// ── Fetch the latest signature_cleared event for the re-sign banner ─────────
//
// Returns the most recent `signature_cleared` entry IF there is no
// `signature_captured` entry that's newer (which would mean someone already
// re-signed). The banner reads `note` to pre-fill the reason field.
export interface ClearedSignatureContext {
  reason: string
  occurredAt: string
}

export function useLastSignatureClear(ticketId: string | undefined) {
  return useQuery({
    queryKey: ['ticket-signature-clear', ticketId],
    queryFn: async (): Promise<ClearedSignatureContext | null> => {
      const { data, error } = await supabase
        .from('ticket_audit_log')
        .select('action, note, occurred_at')
        .eq('ticket_id', ticketId!)
        .in('action', ['signature_cleared', 'signature_captured'])
        .order('occurred_at', { ascending: false })
        .limit(1)
      if (error) throw error
      const latest = data?.[0]
      if (!latest || latest.action !== 'signature_cleared') return null
      return {
        reason: latest.note ?? 'Ticket edited after signing',
        occurredAt: latest.occurred_at as string,
      }
    },
    enabled: !!ticketId,
    staleTime: 0,
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
