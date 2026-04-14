import { useState, useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { useNotifications, useUnreadNotificationCount, useMarkNotificationsRead } from '@/hooks/useNotifications'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// anchor="left"  → dropdown's left edge aligns with bell → opens RIGHTWARD (use in sidebar)
// anchor="right" → dropdown's right edge aligns with bell → opens LEFTWARD (use in topbar)
// opensUp        → dropdown appears above the bell instead of below (use when bell is at bottom of screen)
export function NotificationBell({
  anchor = 'right',
  opensUp = false,
}: {
  anchor?: 'left' | 'right'
  opensUp?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  const { data: unreadCount = 0 } = useUnreadNotificationCount()
  const { data: notifications = [] } = useNotifications()
  const markRead = useMarkNotificationsRead()

  // Close on click outside
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  function handleOpen() {
    setOpen(v => !v)
  }

  function handleNotificationClick(n: { id: string; ticket_id: string | null; read: boolean }) {
    setOpen(false)
    if (!n.read) markRead.mutate([n.id])
    if (n.ticket_id) {
      navigate(isAdmin ? `/admin/tickets/${n.ticket_id}` : `/tickets/${n.ticket_id}`)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={cn(
          'absolute z-50 w-80 rounded-lg border bg-popover shadow-lg',
          opensUp ? 'bottom-full mb-2' : 'top-9',
          anchor === 'left' ? 'left-0' : 'right-0'
        )}>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {notifications.length > 0 && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => markRead.mutate(undefined)}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                <Bell className="h-6 w-6 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={cn(
                    'w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-accent transition-colors',
                    !n.read && 'bg-blue-50 dark:bg-blue-950/20'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <div className={cn('min-w-0', n.read && 'pl-4')}>
                      <p className="text-sm font-medium leading-snug truncate">{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.body}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="border-t px-4 py-2">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-primary hover:underline"
            >
              View full history →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
