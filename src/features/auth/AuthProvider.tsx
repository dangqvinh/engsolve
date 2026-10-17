import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

interface AuthState {
  session: Session | null
  isAdmin: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}
const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [roleChecked, setRoleChecked] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session)).finally(() => setAuthLoading(false))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // The role is read from the database (RLS lets a user read only their own profile). This only drives the UI;
  // every admin write is re-checked by RLS / Edge Functions regardless of what this says.
  const userId = session?.user.id
  useEffect(() => {
    let cancelled = false
    setRoleChecked(false)
    if (!userId) {
      setIsAdmin(false)
      setRoleChecked(true)
      return
    }
    supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
      .then(({ data }) => { if (!cancelled) { setIsAdmin(data?.role === 'admin'); setRoleChecked(true) } })
    return () => { cancelled = true }
  }, [userId])

  const value: AuthState = {
    session, isAdmin, loading: authLoading || (!!session && !roleChecked),
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw new Error('Incorrect email or password.')
    },
    signOut: async () => { await supabase.auth.signOut() },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
