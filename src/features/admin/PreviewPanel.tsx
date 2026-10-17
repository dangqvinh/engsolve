import { useState } from 'react'
import { Button } from '../../components/ui'
import { QuestionCard } from '../practice/QuestionCard'
import type { AdminQuestion, AnswerResult } from '../../types'

/** Admin-only preview. Uses the same QuestionCard as learners, with local (not persisted) feedback. */
export function PreviewPanel({ questions }: { questions: AdminQuestion[] }) {
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, AnswerResult>>({})
  if (questions.length === 0) return <p className="text-sm text-slate-600">No questions to preview.</p>
  const q = questions[i]
  const check = () => {
    const sel = picked[q.id]
    if (!sel || !q.answer.correct_option_id) return
    setResults({ ...results, [q.id]: { is_correct: sel === q.answer.correct_option_id, selected_option_id: sel, correct_option_id: q.answer.correct_option_id, explanation: q.answer.explanation, already_answered: false } })
  }
  return (
    <div className="max-w-2xl">
      <QuestionCard question={q} index={i} total={questions.length} selectedId={picked[q.id] ?? null} result={results[q.id] ?? null} submitting={false}
        onSelect={(o) => setPicked({ ...picked, [q.id]: o })} onSubmit={check} />
      <div className="mt-3 flex justify-between">
        <Button variant="secondary" disabled={i === 0} onClick={() => setI(i - 1)}>Previous</Button>
        <Button variant="secondary" disabled={i === questions.length - 1} onClick={() => setI(i + 1)}>Next</Button>
      </div>
    </div>
  )
}
