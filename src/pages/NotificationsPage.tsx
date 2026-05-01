import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAllNotifications, useMarkNotificationsRead, type Notification } from '@/hooks/useNotifications'
import { useAuth } from '@/contexts/AuthContext'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

function groupByDate(notifications: Notification[]) {
  const groups: { label: string; items: Notification[] }[] = []
  const seen = new Map<string, number>()

  for (const n of notifications) {
    const d = new Date(n.created_at)
    const label = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'MMMM d, yyyy')
    if (!seen.has(label)) {
      seen.set(label, groups.length)
      groups.push({ label, items: [] })
    }
    groups[seen.get(label)!].items.push(n)
  }
  return groups
}

export function NotificationsPage() {
  useDocumentTitle('Notifications')
  const [page, setPage] = useState(0)
  const { data, isLoading } = useAllNotifications(page)
  const markRead = useMarkNotificationsRead()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  const notifications = data?.notifications ?? []
  const total = data?.total ?? 0
  const pageSize = 50
  const totalPages = Math.ceil(total / pageSize)
  const hasUnread = notifications.some(n => !n.read)

  const groups = groupByDate(notifications)

  function handleClick(n: Notification) {
    if (!n.read) markRead.mutate([n.id])
    if (n.ticket_id) {
      navigate(isAdmin ? `/admin/tickets/${n.ticket_id}` : `/tickets/${n.ticket_id}`)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0 ? `${total} total` : 'Your notification history'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasUnread && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markRead.mutate(undefined)}
              disabled={markRead.isPending}
            >
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Bell className="h-10 w-10 opacity-20" />
          <p className="text-sm">No notifications yet</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          {groups.map((group, gi) => (
            <div key={group.label}>
              <div className="px-4 py-2 bg-muted/40 border-b">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {group.label}
                </p>
              </div>
              {group.items.map((n, ni) => {
                const isLast = gi === groups.length - 1 && ni === group.items.length - 1
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      'w-full text-left px-4 py-3.5 transition-colors hover:bg-accent',
                      !isLast && 'border-b',
                      !n.read && 'bg-blue-50 dark:bg-blue-950/20'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {!n.read ? (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      ) : (
                        <span className="mt-1.5 h-2 w-2 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'text-sm leading-snug',
                          !n.read ? 'font-semibold' : 'font-medium'
                        )}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {n.body}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages - 1}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
