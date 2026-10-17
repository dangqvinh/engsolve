import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, PageLoading, inputClass } from '../../components/ui'
import { useAuth } from '../../features/auth/AuthProvider'
import { Logo } from '../../layouts/PublicLayout'
import { errorMessage } from '../../lib/errors'

export default function AdminLoginPage() {
  const { session, isAdmin, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/admin'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <PageLoading />
  if (session && isAdmin) return <Navigate to={from} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await signIn(email.trim(), password); navigate(from, { replace: true }) }
    catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <Card className="w-full max-w-sm p-6">
        <Logo />
        <h1 className="mt-4 text-xl font-bold">Administrator sign in</h1>
        <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
          <label className="block text-sm font-medium">Email
            <input className={`${inputClass} mt-1`} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">Password
            <input className={`${inputClass} mt-1`} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
        </form>
      </Card>
    </div>
  )
}
