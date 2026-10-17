import { useState } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, Plus, Trash2, X } from 'lucide-react'
import { Alert, Badge, Button, Card, inputClass } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { validateDraftQuestion } from '../../lib/parsing'
import { saveQuestion, type QuestionDraft } from '../../services/admin'
import type { AdminQuestion, AnswerSource } from '../../types'

const SOURCE_LABEL: Record<AnswerSource, string> = {
  embedded_answer_key: 'Answer key (in PDF)', uploaded_answer_key: 'Answer key (uploaded)', gemini_ai: 'AI-suggested', admin_manual: 'Set by admin',
}

interface Props {
  question: AdminQuestion
  index: number
  count: number
  userId: string
  onSaved: () => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}

function toDraft(q: AdminQuestion): QuestionDraft {
  const idx = q.options.findIndex((o) => o.id === q.answer.correct_option_id)
  return { text: q.question_text, options: q.options.map((o) => ({ id: o.id, text: o.option_text })), correctIndex: idx >= 0 ? idx : null, explanation: q.answer.explanation ?? '' }
}

export function QuestionEditor({ question, index, count, userId, onSaved, onMove, onDelete }: Props) {
  const [draft, setDraft] = useState<QuestionDraft>(() => toDraft(question))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const problems = validateDraftQuestion(draft)
  const a = question.answer

  const save = async (approve: boolean) => {
    setBusy(true); setError(null)
    try { await saveQuestion(question, draft, userId, approve); onSaved() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  const setOption = (i: number, text: string) => setDraft((d) => ({ ...d, options: d.options.map((o, j) => (j === i ? { ...o, text } : o)) }))
  const removeOption = (i: number) => setDraft((d) => ({
    ...d, options: d.options.filter((_, j) => j !== i),
    correctIndex: d.correctIndex === null ? null : d.correctIndex === i ? null : d.correctIndex > i ? d.correctIndex - 1 : d.correctIndex,
  }))

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold">Question {index + 1}</h3>
        {a.needs_review ? <Badge tone="warning">Needs review</Badge> : <Badge tone="success">Approved</Badge>}
        {a.answer_source && <Badge tone={a.answer_source === 'gemini_ai' ? 'brand' : 'neutral'}>{SOURCE_LABEL[a.answer_source]}</Badge>}
        {a.ai_confidence && <Badge tone="neutral">AI self-rating: {a.ai_confidence}</Badge>}
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" className="px-2 py-1" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" aria-hidden /><span className="sr-only">Move question {index + 1} up</span></Button>
          <Button variant="ghost" className="px-2 py-1" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" aria-hidden /><span className="sr-only">Move question {index + 1} down</span></Button>
          <Button variant="ghost" className="px-2 py-1 text-red-700" onClick={onDelete}><Trash2 className="h-4 w-4" aria-hidden /><span className="sr-only">Delete question {index + 1}</span></Button>
        </div>
      </div>

      {(problems.length > 0 || a.validation_notes.length > 0) && (
        <ul className="mt-2 space-y-1 text-sm text-amber-800">
          {[...problems, ...a.validation_notes].map((p) => <li key={p}>⚠ {p}</li>)}
        </ul>
      )}

      <label className="mt-3 block text-sm font-medium">Question text
        <textarea className={`${inputClass} mt-1`} rows={2} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
      </label>

      <fieldset className="mt-3">
        <legend className="text-sm font-medium">Choices (select the correct one)</legend>
        <div className="mt-1 space-y-2">
          {draft.options.map((o, i) => (
            <div key={o.id ?? `new-${i}`} className="flex items-center gap-2">
              <input type="radio" name={`correct-${question.id}`} checked={draft.correctIndex === i} onChange={() => setDraft({ ...draft, correctIndex: i })} aria-label={`Mark choice ${'ABCDEFGH'[i]} as correct`} />
              <span className="w-5 text-sm font-bold">{'ABCDEFGH'[i]}</span>
              <input className={inputClass} value={o.text} aria-label={`Choice ${'ABCDEFGH'[i]}`} onChange={(e) => setOption(i, e.target.value)} />
              <Button variant="ghost" className="px-2 py-1" onClick={() => removeOption(i)}><X className="h-4 w-4" aria-hidden /><span className="sr-only">Remove choice {'ABCDEFGH'[i]}</span></Button>
            </div>
          ))}
        </div>
        {draft.options.length < 8 && (
          <Button variant="ghost" className="mt-2 px-2 py-1" onClick={() => setDraft({ ...draft, options: [...draft.options, { text: '' }] })}><Plus className="h-4 w-4" aria-hidden />Add choice</Button>
        )}
      </fieldset>

      <label className="mt-3 block text-sm font-medium">Explanation
        <textarea className={`${inputClass} mt-1`} rows={2} maxLength={2000} value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} />
      </label>

      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void save(false)} loading={busy}>Save</Button>
        <Button onClick={() => void save(true)} loading={busy} disabled={problems.length > 0}><CheckCircle2 className="h-4 w-4" aria-hidden />Save and approve</Button>
      </div>
    </Card>
  )
}
