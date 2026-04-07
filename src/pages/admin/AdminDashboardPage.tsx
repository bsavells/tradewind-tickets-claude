import { ClipboardList, CheckCircle, Clock, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function StatCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string
  value: string | number
  icon: React.ElementType
  description?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  )
}

export function AdminDashboardPage() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Overview of all work tickets</p>
      </div>

      {/* Stat cards — wired to live data in Phase 4 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Pending Review" value="—" icon={Clock} description="Submitted, awaiting admin" />
        <StatCard title="Finalized" value="—" icon={CheckCircle} description="This month" />
        <StatCard title="Drafts" value="—" icon={FileText} description="In progress" />
        <StatCard title="Total Tickets" value="—" icon={ClipboardList} description="All time" />
      </div>

      {/* Pending tickets table placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending Review</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <ClipboardList className="h-8 w-8 opacity-30" />
            <p className="text-sm">No tickets pending review</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
