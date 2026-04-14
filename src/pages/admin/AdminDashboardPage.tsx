import { useNavigate } from 'react-router-dom'
import { ClipboardList, CheckCircle, Clock, FileText, ChevronRight, RefreshCw } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useTicketStats, useAllTickets } from '@/hooks/useTickets'
import { statusLabel, statusVariant } from '@/lib/ticketStatus'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  onClick,
}: {
  title: string
  value: string | number
  icon: React.ElementType
  description?: string
  onClick?: () => void
}) {
  return (
    <Card
      className={onClick ? 'cursor-pointer hover:bg-muted/40 transition-colors' : ''}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  )
}

export function AdminDashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useTicketStats()
  const { data: pending = [], isLoading: pendingLoading, refetch: refetchPending } = useAllTickets('submitted')

  const [hasUpdates, setHasUpdates] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Refs so the Realtime callback always sees the latest values
  // without needing to re-subscribe every render
  const autoRefreshRef = useRef(false)
  const refetchStatsRef = useRef(refetchStats)
  const refetchPendingRef = useRef(refetchPending)
  refetchStatsRef.current = refetchStats
  refetchPendingRef.current = refetchPending

  function handleRefresh() {
    refetchStatsRef.current()
    refetchPendingRef.current()
    setHasUpdates(false)
  }

  function handleAutoRefreshChange(val: boolean) {
    setAutoRefresh(val)
    autoRefreshRef.current = val
    if (val) {
      // Always do an immediate refresh when enabling live updates
      handleRefresh()
    }
  }

  // Subscribe to all ticket changes in this company
  useEffect(() => {
    if (!profile?.company_id) return
    const channel = supabase
      .channel(`dashboard-tickets:${profile.company_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `company_id=eq.${profile.company_id}`,
        },
        () => {
          if (autoRefreshRef.current) {
            refetchStatsRef.current()
            refetchPendingRef.current()
          } else {
            setHasUpdates(true)
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.company_id])

  const valueOrDash = (n?: number) => statsLoading ? '—' : (n ?? 0).toString()

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Overview of all work tickets</p>
        </div>
        <div className="flex items-center gap-2 pt-1 shrink-0">
          <Switch
            id="live-updates"
            checked={autoRefresh}
            onCheckedChange={handleAutoRefreshChange}
          />
          <Label htmlFor="live-updates" className="text-sm text-muted-foreground cursor-pointer select-none">
            Live updates
          </Label>
        </div>
      </div>

      {/* New activity banner */}
      {hasUpdates && (
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2.5">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Ticket activity detected — your dashboard may be out of date.
          </p>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline shrink-0 ml-4"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Pending Review"
          value={valueOrDash(stats?.pending)}
          icon={Clock}
          description="Submitted, awaiting admin"
          onClick={() => navigate('/admin/tickets?status=submitted')}
        />
        <StatCard
          title="Finalized"
          value={valueOrDash(stats?.finalizedThisMonth)}
          icon={CheckCircle}
          description="This month"
          onClick={() => navigate('/admin/tickets?status=finalized')}
        />
        <StatCard
          title="Drafts"
          value={valueOrDash(stats?.drafts)}
          icon={FileText}
          description="In progress"
          onClick={() => navigate('/admin/tickets?status=draft')}
        />
        <StatCard
          title="Total Tickets"
          value={valueOrDash(stats?.total)}
          icon={ClipboardList}
          description="All time"
          onClick={() => navigate('/admin/tickets?status=all')}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending Review</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pendingLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <ClipboardList className="h-8 w-8 opacity-30" />
              <p className="text-sm">No tickets pending review</p>
            </div>
          ) : (
            <div>
              {pending.slice(0, 10).map(t => {
                const customerName = (t as unknown as { customers: { name: string } }).customers?.name ?? '—'
                const tech = (t as unknown as { profiles: { first_name: string; last_name: string } | null }).profiles
                const techName = tech ? `${tech.first_name} ${tech.last_name}` : '—'
                const auditLog = (t as unknown as { ticket_audit_log: { action: string; occurred_at: string }[] }).ticket_audit_log ?? []
                const lastSubmittedTime = auditLog
                  .filter(e => e.action === 'submitted')
                  .reduce((max, e) => Math.max(max, e.occurred_at ? new Date(e.occurred_at).getTime() : 0), 0)
                const returnRequested = t.status === 'submitted' && auditLog.some(
                  e => e.action === 'return_requested' && (e.occurred_at ? new Date(e.occurred_at).getTime() : 0) > lastSubmittedTime
                )
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => navigate(`/admin/tickets/${t.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{t.ticket_number}</span>
                        <Badge variant={statusVariant(t.status)} className="text-xs h-4 px-1.5">
                          {statusLabel(t.status)}
                        </Badge>
                        {returnRequested && (
                          <Badge variant="warning" className="text-xs h-4 px-1.5">Return Requested</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {customerName} · {techName} · {format(new Date(t.work_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    {Number(t.grand_total) > 0 && (
                      <span className="text-sm font-semibold tabular-nums">
                        ${Number(t.grand_total).toFixed(2)}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
