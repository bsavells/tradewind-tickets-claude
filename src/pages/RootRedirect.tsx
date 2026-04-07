import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function RootRedirect() {
  const { isAdmin } = useAuth()
  return <Navigate to={isAdmin ? '/admin/dashboard' : '/tickets'} replace />
}
