import { useEffect, useState } from 'react'
import {
  type QueueEntry,
  listQueue,
  subscribeToQueueChanges,
} from '@/lib/syncQueue'

/**
 * Reactive view of the sync queue.
 *
 * Re-reads the queue from IndexedDB whenever the queue's internal change
 * emitter fires (enqueue/dequeue/updateEntry). That covers both same-tab
 * mutations and the runner's own success/failure transitions.
 *
 * Returns:
 *   - `entries`: full list of queued items, oldest first
 *   - `pendingCount`: items still awaiting retry
 *   - `fatalCount`: items the runner has given up on
 */
export function useSyncQueue() {
  const [entries, setEntries] = useState<QueueEntry[]>([])

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      const next = await listQueue()
      if (!cancelled) setEntries(next)
    }
    void refresh()
    const unsub = subscribeToQueueChanges(() => { void refresh() })
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  const pendingCount = entries.filter(e => !e.fatal).length
  const fatalCount = entries.filter(e => e.fatal).length

  return { entries, pendingCount, fatalCount }
}
