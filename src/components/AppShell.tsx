import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import {
  FileText,
  LayoutDashboard,
  ClipboardList,
  LogOut,
  Menu,
  X,
  Settings,
  Bell,
  BellRing,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { NotificationBell } from '@/components/NotificationBell'
import { TradewindLogo, Wordmark, GradientBar } from '@/components/Branding'

function NavItem({ to, icon: Icon, label, onClick }: {
  to: string
  icon: React.ElementType
  label: string
  onClick?: () => void
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all',
          'font-medium',
          isActive
            ? 'bg-[var(--color-tw-navy)] text-white'
            : 'text-[var(--color-tw-navy)]/70 hover:bg-[var(--color-tw-mist)] hover:text-[var(--color-tw-navy)]'
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Active state: vertical cyan accent stripe on the left edge */}
          {isActive && (
            <span
              aria-hidden
              className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-[var(--color-tw-cyan)]"
            />
          )}
          <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-[var(--color-tw-cyan)]')} />
          <span className="truncate">{label}</span>
        </>
      )}
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
    { to: '/notifications', icon: Bell, label: 'Notifications' },
    { to: '/notification-settings', icon: BellRing, label: 'Notification Settings' },
  ]

  const adminNav = [
    { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/tickets', icon: ClipboardList, label: 'All Tickets' },
    { to: '/tickets', icon: FileText, label: 'My Tickets' },
    { to: '/notifications', icon: Bell, label: 'Notifications' },
    { to: '/notification-settings', icon: BellRing, label: 'Notification Settings' },
    { to: '/admin/settings', icon: Settings, label: 'Settings' },
  ]

  const navItems = isAdmin ? adminNav : techNav
  const closeMobile = () => setMobileOpen(false)

  const sidebar = (
    <div className="flex h-full flex-col bg-card">
      {/* Signature gradient bar at the very top */}
      <GradientBar />

      {/* Brand lockup */}
      <div className="px-4 py-5 border-b border-[var(--color-tw-navy)]/10">
        <Wordmark size="sm" />
        <p className="tw-label mt-2 text-[9px] text-[var(--color-tw-blue)]/70 pl-[34px]">
          Efficiency&ensp;—&ensp;Solved.
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {navItems.map(item => (
          <NavItem key={item.to} {...item} onClick={closeMobile} />
        ))}
      </nav>

      {/* User card */}
      <div className="border-t border-[var(--color-tw-navy)]/10 p-3 space-y-1">
        <div className="flex items-start justify-between gap-2 rounded-md px-3 py-2 bg-[var(--color-tw-mist)]/60">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--color-tw-navy)] truncate">
              {profile?.first_name} {profile?.last_name}
            </p>
            <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
            <p className="tw-label text-[9px] mt-1">
              {profile?.role}{profile?.is_readonly_admin ? ' · read-only' : ''}
            </p>
          </div>
          <NotificationBell anchor="left" opensUp />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-[var(--color-tw-navy)] hover:bg-[var(--color-tw-mist)]"
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
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-[var(--color-tw-navy)]/10 bg-card">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-[var(--color-tw-navy)]/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64 bg-card border-r border-[var(--color-tw-navy)]/10 shadow-2xl z-50">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile topbar */}
        <header className="md:hidden flex flex-col shrink-0 bg-card border-b border-[var(--color-tw-navy)]/10">
          <GradientBar />
          <div className="flex items-center gap-3 px-4 h-14">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-1 rounded-md text-[var(--color-tw-navy)]/70 hover:text-[var(--color-tw-navy)] hover:bg-[var(--color-tw-mist)] transition-colors"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2 flex-1">
              <TradewindLogo size={22} />
              <span className="tw-wordmark text-sm">
                <span className="font-extrabold text-[var(--color-tw-navy)]">TRADEWIND</span>
                <span className="text-[var(--color-tw-blue)] opacity-60 mx-1.5">·</span>
                <span className="font-light text-[var(--color-tw-blue)]">TICKETS</span>
              </span>
            </div>
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
