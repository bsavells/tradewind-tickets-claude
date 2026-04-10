import { useEffect, useRef } from 'react'
import { set, get, del } from 'idb-keyval'
import type { TicketFormData } from './useTickets'

const DRAFT_PREFIX = 'ticket-draft-v2-'

export function draftKey(ticketId: string) {
  return `${DRAFT_PREFIX}${ticketId}`
}

export async function loadDraft(ticketId: string): Promise<TicketFormData | null> {
  try {
    const saved = await get<{ data: TicketFormData; savedAt: number }>(draftKey(ticketId))
    return saved?.data ?? null
  } catch {
    return null
  }
}

export async function clearDraft(ticketId: string) {
  try {
    await del(draftKey(ticketId))
  } catch {
    // ignore
  }
}

/** Auto-saves form data to IndexedDB ~3s after changes stop */
export function useDraftAutosave(ticketId: string, data: TicketFormData) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        await set(draftKey(ticketId), { data: dataRef.current, savedAt: Date.now() })
      } catch {
        // storage may be unavailable (private browsing) — fail silently
      }
    }, 3000)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [ticketId, data])
}
