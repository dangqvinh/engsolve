import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Library, LogOut, Upload } from 'lucide-react'
import { useAuth } from '../features/auth/AuthProvider'
import { Logo } from './PublicLayout'

export function AdminLayout() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-white p-3 md:min-h-screen md:w-60 md:border-b-0 md:border-r md:p-4">
        <Link to="/" className="mb-3 block md:mb-6"><Logo /></Link>
        <nav className="flex flex-wrap gap-1 md:flex-col" aria-label="Admin">
          <NavLink to="/admin" end className={link}><LayoutDashboard className="h-4 w-4" aria-hidden />Dashboard</NavLink>
          <NavLink to="/admin/exercises" className={link}><Library className="h-4 w-4" aria-hidden />Exercises</NavLink>
          <NavLink to="/admin/upload" className={link}><Upload className="h-4 w-4" aria-hidden />Upload PDF</NavLink>
        </nav>
        <div className="mt-3 border-t border-slate-200 pt-3 md:mt-8">
          <p className="truncate px-3 text-xs text-slate-500">{session?.user.email}</p>
          <button className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            onClick={() => void signOut().then(() => navigate('/admin/login'))}>
            <LogOut className="h-4 w-4" aria-hidden />Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-5xl"><Outlet /></div></main>
    </div>
  )
}
