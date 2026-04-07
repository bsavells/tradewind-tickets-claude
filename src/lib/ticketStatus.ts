import type { Database } from './database.types'

type TicketStatus = Database['public']['Tables']['tickets']['Row']['status']

export function statusLabel(status: TicketStatus): string {
  switch (status) {
    case 'draft': return 'Draft'
    case 'submitted': return 'Submitted'
    case 'returned': return 'Returned'
    case 'finalized': return 'Finalized'
  }
}

export function statusVariant(status: TicketStatus) {
  switch (status) {
    case 'draft': return 'secondary' as const
    case 'submitted': return 'warning' as const
    case 'returned': return 'destructive' as const
    case 'finalized': return 'success' as const
  }
}
