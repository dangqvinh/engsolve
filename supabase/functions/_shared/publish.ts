// Publish-readiness rules, enforced server-side in publish-exercise.
export interface PublishQuestion {
  id: string
  question_text: string
  options: { id: string; option_text: string }[]
  correct_option_id: string | null
  needs_review: boolean
}

export function validateForPublish(questions: PublishQuestion[]): string[] {
  const errors: string[] = []
  if (questions.length === 0) return ['The exercise has no questions.']
  questions.forEach((q, i) => {
    const n = i + 1
    if (!q.question_text.trim()) errors.push(`Question ${n}: text is empty.`)
    if (q.options.length < 2) errors.push(`Question ${n}: needs at least 2 choices.`)
    if (q.options.some((o) => !o.option_text.trim())) errors.push(`Question ${n}: has an empty choice.`)
    if (!q.correct_option_id) errors.push(`Question ${n}: no correct answer selected.`)
    else if (!q.options.some((o) => o.id === q.correct_option_id)) errors.push(`Question ${n}: correct answer is not one of its choices.`)
    if (q.needs_review) errors.push(`Question ${n}: not yet approved by an administrator.`)
  })
  return errors
}
