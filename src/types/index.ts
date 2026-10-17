export type AnswerSource = 'embedded_answer_key' | 'uploaded_answer_key' | 'gemini_ai' | 'admin_manual'
export type ProcessingStatus = 'uploaded' | 'extracting' | 'extracted' | 'generating_answers' | 'needs_review' | 'failed'

export interface Exercise {
  id: string
  title: string
  description: string | null
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
  published_at: string | null
}
export interface ExerciseListItem extends Exercise { question_count: number }

export interface Option { id: string; option_label: string; option_text: string; option_order: number }
export interface PublicQuestion { id: string; question_text: string; question_order: number; options: Option[] }

export interface QuestionAnswer {
  correct_option_id: string | null
  explanation: string | null
  answer_source: AnswerSource | null
  ai_confidence: 'low' | 'medium' | 'high' | null
  needs_review: boolean
  validation_notes: string[]
}
export interface AdminQuestion extends PublicQuestion { answer: QuestionAnswer }

export interface AnswerResult {
  is_correct: boolean
  selected_option_id: string
  correct_option_id: string
  explanation: string | null
  already_answered: boolean
}
export interface AttemptStart { attempt_id: string; token: string; total_questions: number }
export interface ReviewItem {
  question_id: string
  selected_option_id: string | null
  is_correct: boolean | null
  correct_option_id: string | null
  explanation: string | null
}
export interface AttemptResult {
  exercise_id: string
  total: number; correct: number; incorrect: number; unanswered: number; percentage: number
  review: ReviewItem[]
}
