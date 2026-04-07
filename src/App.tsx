import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppShell } from '@/components/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { RootRedirect } from '@/pages/RootRedirect'
import { MyTicketsPage } from '@/pages/tech/MyTicketsPage'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { AdminTicketsPage } from '@/pages/admin/AdminTicketsPage'
import { AdminCustomersPage } from '@/pages/admin/AdminCustomersPage'
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage'
import { AdminSettingsPage } from '@/pages/admin/AdminSettingsPage'
import { AdminClassificationsPage } from '@/pages/admin/AdminClassificationsPage'
import { AdminVehiclesPage } from '@/pages/admin/AdminVehiclesPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Protected — all logged-in users */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<RootRedirect />} />
                <Route path="/tickets" element={<MyTicketsPage />} />

                {/* Admin-only */}
                <Route element={<ProtectedRoute requireAdmin />}>
                  <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
                  <Route path="/admin/tickets" element={<AdminTicketsPage />} />
                  <Route path="/admin/customers" element={<AdminCustomersPage />} />
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                  <Route path="/admin/settings" element={<AdminSettingsPage />} />
                  <Route path="/admin/settings/classifications" element={<AdminClassificationsPage />} />
                  <Route path="/admin/settings/vehicles" element={<AdminVehiclesPage />} />
                </Route>
              </Route>
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
