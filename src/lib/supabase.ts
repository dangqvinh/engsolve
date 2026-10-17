import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configError =
  !url || !anon ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.' : null

// Only the public anon key lives in the browser. All access is governed by RLS and Edge Functions.
export const supabase = createClient(url ?? 'http://localhost:54321', anon ?? 'missing-anon-key')
