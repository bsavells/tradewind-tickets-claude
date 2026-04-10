import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import {
  Wind,
  FileText,
  LayoutDashboard,
  Users,
  Building2,
  ClipboardList,
  LogOut,
  Menu,
  X,
  Settings,
  Truck,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

function NavItem({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </NavLink>
  )
}

export function AppShell() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const techNav = [
    { to: '/tickets', icon: FileText, label: 'My Tickets' },
  ]

  const adminNav = [
    { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/tickets', icon: ClipboardList, label: 'All Tickets' },
    { to: '/tickets', icon: FileText, label: 'My Tickets' },
    { to: '/admin/customers', icon: Building2, label: 'Customers' },
    { to: '/admin/users', icon: Users, label: 'Users' },
    { to: '/admin/vehicles', icon: Truck, label: 'Vehicles' },
    { to: '/admin/settings', icon: Settings, label: 'Settings' },
  ]

  const navItems = isAdmin ? adminNav : techNav

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b">
        <Wind className="h-6 w-6 text-primary" />
        <div>
          <p className="font-semibold text-sm leading-none">Tradewind</p>
          <p className="text-xs text-muted-foreground leading-none mt-0.5">Work Tickets</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map(item => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* User */}
      <div className="border-t p-3 space-y-1">
        <div className="px-3 py-2">
          <p className="text-sm font-medium truncate">
            {profile?.first_name} {profile?.last_name}
          </p>
          <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
          <p className="text-xs text-muted-foreground capitalize mt-0.5">
            {profile?.role}{profile?.is_readonly_admin ? ' (read-only)' : ''}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r bg-card">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64 bg-card border-r shadow-xl z-50">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center gap-3 border-b px-4 h-14 bg-card shrink-0">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2">
            <Wind className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Tradewind</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
