import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useSyncQueue } from '@/hooks/useSyncQueue'
import { runOnce } from '@/lib/syncRunner'
import { clearAll } from '@/lib/syncQueue'

/**
 * Top-of-screen banner that surfaces network state and the sync queue.
 *
 * Three modes:
 *  - Offline: "You're offline" + queue depth (so the user knows their work
 *    is captured and will sync later).
 *  - Online with pending items: shows the queue is draining ("Syncing N
 *    items").
 *  - Online with fatal items: warns the user that something failed
 *    permanently, with a Clear button to drop the entries.
 *
 * No render when online and queue is empty — the common case stays clean.
 */
export function OfflineBanner() {
  const online = useOnlineStatus()
  const { pendingCount, fatalCount } = useSyncQueue()

  const isOffline = !online
  const hasPending = pendingCount > 0
  const hasFatal = fatalCount > 0

  if (!isOffline && !hasPending && !hasFatal) return null

  // Offline takes precedence over fatal — the user can't do anything about
  // a fatal until they're back online anyway.
  if (isOffline) {
    return (
      <Bar tone="warning">
        <CloudOff className="h-4 w-4" />
        <span>You're offline. Your changes are saved and will sync when reconnected.</span>
        {hasPending && (
          <span className="ml-auto text-xs opacity-80">
            {pendingCount} pending
          </span>
        )}
      </Bar>
    )
  }

  if (hasPending) {
    return (
      <Bar tone="info">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Syncing {pendingCount} item{pendingCount === 1 ? '' : 's'}…</span>
        <button
          onClick={() => { void runOnce() }}
          className="ml-auto text-xs underline opacity-90 hover:opacity-100"
        >
          Retry now
        </button>
      </Bar>
    )
  }

  // hasFatal && online && !hasPending
  return (
    <Bar tone="error">
      <TriangleAlert className="h-4 w-4" />
      <span>{fatalCount} item{fatalCount === 1 ? '' : 's'} failed to sync.</span>
      <button
        onClick={() => { void clearAll() }}
        className="ml-auto text-xs underline opacity-90 hover:opacity-100"
      >
        Clear
      </button>
    </Bar>
  )
}

function Bar({
  tone,
  children,
}: {
  tone: 'warning' | 'info' | 'error'
  children: React.ReactNode
}) {
  const toneClasses = {
    warning: 'bg-amber-600 text-white',
    info: 'bg-primary text-primary-foreground',
    error: 'bg-destructive text-destructive-foreground',
  }[tone]
  return (
    <div className={`fixed top-0 inset-x-0 z-50 ${toneClasses}`}>
      <div className="mx-auto max-w-screen-md px-4 py-2 flex items-center gap-2 text-sm">
        {children}
      </div>
    </div>
  )
}
