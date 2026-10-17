import { HttpError, isUuid, requireAttempt, serve, serviceClient } from '../_shared/http.ts'

serve('submit-answer', async (_req, body) => {
  if (!isUuid(body.question_id) || !isUuid(body.option_id)) throw new HttpError(400, 'Invalid question or choice.', 'bad_request')
  const db = serviceClient()
  const attempt = await requireAttempt(db, body.attempt_id, body.token)
  if (attempt.completed_at) throw new HttpError(409, 'This attempt is already finished.', 'completed')

  const { data: q } = await db.from('questions').select('id,exercise_id').eq('id', body.question_id).maybeSingle()
  if (!q || q.exercise_id !== attempt.exercise_id) throw new HttpError(400, 'That question is not part of this exercise.', 'bad_request')

  const { data: opt } = await db.from('question_options').select('id').eq('id', body.option_id).eq('question_id', q.id).maybeSingle()
  if (!opt) throw new HttpError(400, 'That choice does not belong to this question.', 'bad_request')

  const { data: key } = await db.from('question_answers').select('correct_option_id,explanation').eq('question_id', q.id).maybeSingle()
  if (!key?.correct_option_id) throw new HttpError(409, 'This question has no answer yet.', 'no_answer')

  // Answers lock on first submission. A duplicate returns the stored result and cannot change the score.
  const { data: existing } = await db.from('attempt_answers').select('selected_option_id,is_correct')
    .eq('attempt_id', attempt.id).eq('question_id', q.id).maybeSingle()
  if (existing) {
    return { is_correct: existing.is_correct, selected_option_id: existing.selected_option_id, correct_option_id: key.correct_option_id, explanation: key.explanation, already_answered: true }
  }
  const isCorrect = key.correct_option_id === opt.id
  const { error } = await db.from('attempt_answers').insert({ attempt_id: attempt.id, question_id: q.id, selected_option_id: opt.id, is_correct: isCorrect })
  if (error) {
    if (error.code === '23505') { // lost a race with a concurrent duplicate request
      const { data: again } = await db.from('attempt_answers').select('selected_option_id,is_correct').eq('attempt_id', attempt.id).eq('question_id', q.id).single()
      return { is_correct: again!.is_correct, selected_option_id: again!.selected_option_id, correct_option_id: key.correct_option_id, explanation: key.explanation, already_answered: true }
    }
    throw error
  }
  return { is_correct: isCorrect, selected_option_id: opt.id, correct_option_id: key.correct_option_id, explanation: key.explanation, already_answered: false }
})
