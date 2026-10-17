export interface DraftOption { id?: string; text: string }
export interface DraftQuestion {
  text: string
  options: DraftOption[]
  correctIndex: number | null
  warnings?: string[]
}

export const MAX_QUESTION_TEXT_LENGTH = 4000
export const MAX_OPTION_TEXT_LENGTH = 1000

/** Problems that make a question unpublishable. Empty array means valid. */
export function validateDraftQuestion(q: DraftQuestion): string[] {
  const problems: string[] = []
  if (!q.text.trim()) problems.push('Question text is empty')
  if (q.text.length > MAX_QUESTION_TEXT_LENGTH) {
    problems.push(`Question text exceeds ${MAX_QUESTION_TEXT_LENGTH} characters`)
  }
  if (q.options.some((o) => o.text.length > MAX_OPTION_TEXT_LENGTH)) {
    problems.push(`A choice exceeds ${MAX_OPTION_TEXT_LENGTH} characters`)
  }
  if (q.options.length < 2) problems.push('Needs at least 2 choices')
  if (q.options.length > 8) problems.push('At most 8 choices are supported')
  if (q.options.some((o) => !o.text.trim())) problems.push('A choice is empty')
  if (q.correctIndex === null || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
    problems.push('No correct answer selected')
  }
  return problems
}
