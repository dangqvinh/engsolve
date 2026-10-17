import { HttpError, isUuid, requireAdmin, serve, serviceClient } from '../_shared/http.ts'
import { validateForPublish, type PublishQuestion } from '../_shared/publish.ts'

serve('publish-exercise', async (req, body) => {
  if (!isUuid(body.exercise_id)) throw new HttpError(400, 'Invalid exercise.', 'bad_request')
  if (body.action !== 'publish' && body.action !== 'unpublish') throw new HttpError(400, 'Action must be "publish" or "unpublish".', 'bad_request')
  const db = serviceClient()
  await requireAdmin(req, db)

  if (body.action === 'unpublish') {
    const { error } = await db.from('exercises').update({ status: 'draft' }).eq('id', body.exercise_id)
    if (error) throw error
    return { status: 'draft' }
  }

  const { data: qs, error } = await db.from('questions')
    .select('id,question_text,question_order,question_options(id,option_text),question_answers(correct_option_id,needs_review)')
    .eq('exercise_id', body.exercise_id).order('question_order')
  if (error) throw error
  const questions: PublishQuestion[] = (qs ?? []).map((q) => {
    const a = Array.isArray(q.question_answers) ? q.question_answers[0] : q.question_answers
    return { id: q.id, question_text: q.question_text, options: q.question_options ?? [], correct_option_id: a?.correct_option_id ?? null, needs_review: a?.needs_review ?? true }
  })
  const problems = validateForPublish(questions)
  if (problems.length) {
    const err = new HttpError(422, `Cannot publish yet: ${problems.slice(0, 5).join(' ')}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ''}`, 'not_publishable')
    throw err
  }
  const { error: upErr } = await db.from('exercises').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', body.exercise_id)
  if (upErr) throw upErr
  return { status: 'published' }
})
