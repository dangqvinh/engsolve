// Shared HTTP helpers for Edge Functions (Deno runtime).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'error') {
    super(message)
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const origin = req.headers.get('origin') ?? ''
  // If ALLOWED_ORIGINS is unset we fall back to '*' (fine for a hobby project, documented in README).
  const allow = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

/** Wraps a handler: CORS preflight, POST-only, JSON body parsing and uniform error responses. */
export function serve(name: string, handler: (req: Request, body: Record<string, unknown>) => Promise<unknown>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
      let body: unknown
      try {
        body = await req.json()
      } catch {
        throw new HttpError(400, 'Request body must be valid JSON')
      }
      if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'Request body must be a JSON object')
      return json(req, await handler(req, body as Record<string, unknown>))
    } catch (err) {
      if (err instanceof HttpError) return json(req, { error: err.message, code: err.code }, err.status)
      // Never leak internals to the browser; log message only (no secrets are ever in error text).
      console.error(`[${name}] unexpected error:`, err instanceof Error ? err.message : String(err))
      return json(req, { error: 'Something went wrong on the server. Please try again.', code: 'internal' }, 500)
    }
  })
}

export function requireEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new HttpError(500, `Server is missing required configuration: ${name}`, 'config')
  return v
}

/** Service-role client. Only ever used after the caller has been authorised. */
export function serviceClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Verifies the caller's JWT with Supabase Auth and checks profiles.role = 'admin' in the database. */
export async function requireAdmin(req: Request, db: SupabaseClient): Promise<{ userId: string }> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Please sign in.', 'unauthenticated')
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Please sign in again.', 'unauthenticated')
  const { data: profile } = await db.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
  if (profile?.role !== 'admin') throw new HttpError(403, 'Administrator access is required.', 'forbidden')
  return { userId: data.user.id }
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Loads an attempt and checks the caller's secret token. Same error for "missing" and "wrong token". */
export async function requireAttempt(db: SupabaseClient, attemptId: unknown, token: unknown) {
  if (!isUuid(attemptId) || typeof token !== 'string' || token.length < 20 || token.length > 200) {
    throw new HttpError(400, 'Invalid attempt.', 'bad_request')
  }
  const { data: attempt } = await db.from('attempts').select('*').eq('id', attemptId).maybeSingle()
  if (!attempt || !safeEqual(attempt.token_hash, await sha256Hex(token))) {
    throw new HttpError(404, 'Attempt not found.', 'not_found')
  }
  return attempt as {
    id: string; exercise_id: string; total_questions: number; completed_at: string | null
    correct_count: number; incorrect_count: number; unanswered_count: number; score_percentage: number
  }
}
