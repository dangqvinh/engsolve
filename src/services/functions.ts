import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/** Calls an Edge Function and turns its JSON error body into a readable Error. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = await error.context.json()
        if (payload?.error) throw new Error(payload.error)
      } catch (inner) {
        if (inner instanceof Error && inner.message !== error.message && !(inner instanceof SyntaxError)) throw inner
      }
    }
    throw new Error('Could not reach the server. Check your connection and try again.')
  }
  return data as T
}
