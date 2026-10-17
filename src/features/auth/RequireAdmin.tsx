import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Spinner } from '../../components/ui'
import { useAuth } from './AuthProvider'

export function RequireAdmin() {
  const { session, isAdmin, loading, signOut } = useAuth()
  const location = useLocation()
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>
  if (!session) return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  if (!isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-bold">No administrator access</h1>
          <p className="mt-2 text-slate-600">This account is signed in but is not an administrator.</p>
          <button className="mt-4 rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white" onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>
    )
  }
  return <Outlet />
}
