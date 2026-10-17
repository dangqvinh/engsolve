import { HttpError, isUuid, serve, serviceClient, sha256Hex } from '../_shared/http.ts'

serve('start-attempt', async (_req, body) => {
  if (!isUuid(body.exercise_id)) throw new HttpError(400, 'Invalid exercise.', 'bad_request')
  const db = serviceClient()
  const { data: ex } = await db.from('exercises').select('id,status').eq('id', body.exercise_id).maybeSingle()
  if (!ex || ex.status !== 'published') throw new HttpError(404, 'This exercise is not available.', 'not_found')

  const { count } = await db.from('questions').select('id', { count: 'exact', head: true }).eq('exercise_id', ex.id)
  const total = count ?? 0
  if (total === 0) throw new HttpError(409, 'This exercise has no questions yet.', 'empty')

  // The secret never leaves the guest's browser except in requests for this attempt; we only store its hash.
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  const { data: attempt, error } = await db
    .from('attempts')
    .insert({ exercise_id: ex.id, token_hash: await sha256Hex(token), total_questions: total, unanswered_count: total })
    .select('id')
    .single()
  if (error) throw error
  return { attempt_id: attempt.id, token, total_questions: total }
})
