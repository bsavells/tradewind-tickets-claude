import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppShell } from '@/components/AppShell'
// Public + entry routes stay eager so the cold-load path (login screen,
// auth callbacks, the customer signing link) doesn't pay an extra roundtrip.
import { LoginPage } from '@/pages/LoginPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { RootRedirect } from '@/pages/RootRedirect'
import { SignTicketPage } from '@/pages/SignTicketPage'
import { UpdateBanner } from '@/components/UpdateBanner'

// Authenticated app routes are code-split per page. lazy() needs a default
// export, so we adapt our named exports inline.
const MyTicketsPage = lazy(() =>
  import('@/pages/tech/MyTicketsPage').then(m => ({ default: m.MyTicketsPage })))
const TicketFormPage = lazy(() =>
  import('@/pages/tech/TicketFormPage').then(m => ({ default: m.TicketFormPage })))
const TicketDetailPage = lazy(() =>
  import('@/pages/tech/TicketDetailPage').then(m => ({ default: m.TicketDetailPage })))
const AdminDashboardPage = lazy(() =>
  import('@/pages/admin/AdminDashboardPage').then(m => ({ default: m.AdminDashboardPage })))
const AdminTicketsPage = lazy(() =>
  import('@/pages/admin/AdminTicketsPage').then(m => ({ default: m.AdminTicketsPage })))
const AdminTicketReviewPage = lazy(() =>
  import('@/pages/admin/AdminTicketReviewPage').then(m => ({ default: m.AdminTicketReviewPage })))
const AdminReportsPage = lazy(() =>
  import('@/pages/admin/AdminReportsPage').then(m => ({ default: m.AdminReportsPage })))
const AdminCustomersPage = lazy(() =>
  import('@/pages/admin/AdminCustomersPage').then(m => ({ default: m.AdminCustomersPage })))
const AdminUsersPage = lazy(() =>
  import('@/pages/admin/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })))
const AdminSettingsPage = lazy(() =>
  import('@/pages/admin/AdminSettingsPage').then(m => ({ default: m.AdminSettingsPage })))
const AdminClassificationsPage = lazy(() =>
  import('@/pages/admin/AdminClassificationsPage').then(m => ({ default: m.AdminClassificationsPage })))
const AdminVehiclesPage = lazy(() =>
  import('@/pages/admin/AdminVehiclesPage').then(m => ({ default: m.AdminVehiclesPage })))
const NotificationsPage = lazy(() =>
  import('@/pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })))
const NotificationPrefsPage = lazy(() =>
  import('@/pages/NotificationPrefsPage').then(m => ({ default: m.NotificationPrefsPage })))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function PageLoader() {
  return (
    <div className="flex justify-center items-center h-60">
      <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, retry: 1 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <UpdateBanner />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/sign/:token" element={<SignTicketPage />} />

              {/* Protected */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                  <Route path="/" element={<RootRedirect />} />

                  {/* Shared routes */}
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/notification-settings" element={<NotificationPrefsPage />} />

                  {/* User routes */}
                  <Route path="/tickets" element={<MyTicketsPage />} />
                  <Route path="/tickets/new" element={<TicketFormPage />} />
                  <Route path="/tickets/:id" element={<TicketDetailPage />} />
                  <Route path="/tickets/:id/edit" element={<TicketFormPage />} />

                  {/* Admin routes */}
                  <Route element={<ProtectedRoute requireAdmin />}>
                    <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
                    <Route path="/admin/tickets" element={<AdminTicketsPage />} />
                    <Route path="/admin/tickets/:id" element={<AdminTicketReviewPage />} />
                    <Route path="/admin/reports" element={<AdminReportsPage />} />
                    <Route path="/admin/customers" element={<AdminCustomersPage />} />
                    <Route path="/admin/users" element={<AdminUsersPage />} />
                    <Route path="/admin/vehicles" element={<AdminVehiclesPage />} />
                    <Route path="/admin/settings" element={<AdminSettingsPage />} />
                    <Route path="/admin/settings/classifications" element={<AdminClassificationsPage />} />
                    <Route path="/admin/settings/vehicles" element={<AdminVehiclesPage />} />
                  </Route>
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
