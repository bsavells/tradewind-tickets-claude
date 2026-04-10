import { useNavigate } from 'react-router-dom'
import { Building2, Users, Tag, Truck, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const sections = [
  {
    to: '/admin/customers',
    icon: Building2,
    label: 'Customers',
    description: 'Add and manage customer accounts and contacts',
  },
  {
    to: '/admin/users',
    icon: Users,
    label: 'Users',
    description: 'Manage team members, roles, and default assignments',
  },
  {
    to: '/admin/settings/classifications',
    icon: Tag,
    label: 'Classifications',
    description: 'Labor categories and default billing rates',
  },
  {
    to: '/admin/vehicles',
    icon: Truck,
    label: 'Vehicles',
    description: 'Company vehicles and mileage rates',
  },
]

export function AdminSettingsPage() {
  const navigate = useNavigate()

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Configure your account setup</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map(s => (
          <Card
            key={s.to}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => navigate(s.to)}
          >
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{s.label}</p>
                <p className="text-sm text-muted-foreground truncate">{s.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
