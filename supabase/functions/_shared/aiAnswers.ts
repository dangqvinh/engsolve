// Validation of Gemini output. The model is untrusted: nothing is saved unless it passes here.
export type Confidence = 'low' | 'medium' | 'high'

export interface QuestionForAi {
  index: number
  labels: string[] // option labels that actually exist, e.g. ['A','B','C','D']
}
export interface ValidAiAnswer {
  index: number
  correctLabel: string
  explanation: string
  confidence: Confidence
  needsReview: boolean
}
export interface RejectedAiAnswer {
  index: number | null
  reason: string
}

const CONFIDENCES: Confidence[] = ['low', 'medium', 'high']

export function validateAiAnswers(
  raw: unknown,
  questions: QuestionForAi[],
): { valid: ValidAiAnswer[]; rejected: RejectedAiAnswer[] } {
  const valid: ValidAiAnswer[] = []
  const rejected: RejectedAiAnswer[] = []
  const byIndex = new Map(questions.map((q) => [q.index, q]))
  const seen = new Set<number>()

  const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.answers) ? raw.answers : null
  if (!list) return { valid, rejected: [{ index: null, reason: 'Response is not a list of answers' }] }

  for (const item of list) {
    if (!isRecord(item)) {
      rejected.push({ index: null, reason: 'Item is not an object' })
      continue
    }
    const index = typeof item.index === 'number' && Number.isInteger(item.index) ? item.index : null
    if (index === null || !byIndex.has(index)) {
      rejected.push({ index, reason: 'Unknown question index' })
      continue
    }
    if (seen.has(index)) {
      rejected.push({ index, reason: 'Duplicate answer for question' })
      continue
    }
    seen.add(index)
    const labels = byIndex.get(index)!.labels
    const label = typeof item.correct_label === 'string' ? item.correct_label.trim().toUpperCase() : ''
    const match = labels.find((l) => l.toUpperCase() === label)
    if (!match) {
      // Never guess. Leave the question unanswered for the admin.
      rejected.push({ index, reason: 'correct_label is missing or not one of the choices' })
      continue
    }
    const explanation = typeof item.explanation === 'string' ? item.explanation.trim().slice(0, 1000) : ''
    const confidence = CONFIDENCES.includes(item.confidence as Confidence) ? (item.confidence as Confidence) : 'low'
    valid.push({
      index,
      correctLabel: match,
      explanation,
      confidence,
      needsReview: true, // every AI answer needs human approval, whatever the model says
    })
  }
  return { valid, rejected }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
