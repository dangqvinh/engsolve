import { Link, NavLink, Outlet } from 'react-router-dom'
import { BookOpenCheck } from 'lucide-react'

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white"><BookOpenCheck className="h-5 w-5" aria-hidden /></span>
      EngSolve
    </span>
  )
}

export function PublicLayout() {
  const link = ({ isActive }: { isActive: boolean }) => `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900'}`
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" aria-label="EngSolve home"><Logo /></Link>
          <nav className="flex gap-1" aria-label="Main">
            <NavLink to="/" end className={link}>Home</NavLink>
            <NavLink to="/exercises" className={link}>Exercises</NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8"><Outlet /></main>
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        EngSolve — English Practice · <Link to="/admin" className="hover:underline">Admin</Link>
      </footer>
    </div>
  )
}
