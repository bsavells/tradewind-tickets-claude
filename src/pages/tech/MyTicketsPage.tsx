import { FileText, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'

export function MyTicketsPage() {
  const { profile } = useAuth()

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Tickets</h1>
          <p className="text-muted-foreground text-sm">
            Welcome back, {profile?.first_name}
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Ticket
        </Button>
      </div>

      {/* Placeholder — ticket list goes here in Phase 2 */}
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-3">
        <FileText className="h-12 w-12 opacity-30" />
        <p className="font-medium">No tickets yet</p>
        <p className="text-sm">Create your first work ticket to get started.</p>
      </div>
    </div>
  )
}
