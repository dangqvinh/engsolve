import { requireAttempt, serve, serviceClient } from '../_shared/http.ts'
import { computeScore } from '../_shared/scoring.ts'

// Idempotent: calling it again returns the stored result and review.
serve('complete-attempt', async (_req, body) => {
  const db = serviceClient()
  const attempt = await requireAttempt(db, body.attempt_id, body.token)

  const { data: answers } = await db.from('attempt_answers').select('question_id,selected_option_id,is_correct').eq('attempt_id', attempt.id)
  const rows = answers ?? []

  let score = {
    total: attempt.total_questions, correct: attempt.correct_count, incorrect: attempt.incorrect_count,
    unanswered: attempt.unanswered_count, percentage: Number(attempt.score_percentage),
  }
  if (!attempt.completed_at) {
    // Server-side truth: recount from stored answers; nothing from the client is used.
    score = computeScore({ totalQuestions: attempt.total_questions, correctCount: rows.filter((r) => r.is_correct).length, answeredCount: rows.length })
    const { error } = await db.from('attempts').update({
      correct_count: score.correct, incorrect_count: score.incorrect, unanswered_count: score.unanswered,
      score_percentage: score.percentage, completed_at: new Date().toISOString(),
    }).eq('id', attempt.id).is('completed_at', null)
    if (error) throw error
  }

  // Review data (correct answers + explanations) is only released once the attempt is finished.
  const { data: qs } = await db.from('questions').select('id,question_order').eq('exercise_id', attempt.exercise_id).order('question_order')
  const ids = (qs ?? []).map((q) => q.id)
  const { data: keys } = await db.from('question_answers').select('question_id,correct_option_id,explanation').in('question_id', ids)
  const keyBy = new Map((keys ?? []).map((k) => [k.question_id, k]))
  const ansBy = new Map(rows.map((r) => [r.question_id, r]))
  const review = ids.map((id) => ({
    question_id: id,
    selected_option_id: ansBy.get(id)?.selected_option_id ?? null,
    is_correct: ansBy.get(id)?.is_correct ?? null,
    correct_option_id: keyBy.get(id)?.correct_option_id ?? null,
    explanation: keyBy.get(id)?.explanation ?? null,
  }))
  return { exercise_id: attempt.exercise_id, ...score, review }
})
