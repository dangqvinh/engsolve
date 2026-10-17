// Pure scoring logic shared by Edge Functions and unit tests. No Deno/DOM APIs here.
export interface ScoreInput {
  totalQuestions: number
  correctCount: number
  answeredCount: number
}
export interface ScoreResult {
  total: number
  correct: number
  incorrect: number
  unanswered: number
  percentage: number
}

/** Authoritative score. Safe for zero questions; clamps inconsistent input. */
export function computeScore({ totalQuestions, correctCount, answeredCount }: ScoreInput): ScoreResult {
  const total = Math.max(0, Math.floor(totalQuestions))
  const answered = Math.min(total, Math.max(0, Math.floor(answeredCount)))
  const correct = Math.min(answered, Math.max(0, Math.floor(correctCount)))
  const percentage = total === 0 ? 0 : Math.round((correct / total) * 10000) / 100
  return { total, correct, incorrect: answered - correct, unanswered: total - answered, percentage }
}
