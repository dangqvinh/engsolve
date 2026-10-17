import { Check, X } from 'lucide-react'
import { Button, Card } from '../../components/ui'
import type { AnswerResult, PublicQuestion } from '../../types'

interface Props {
  question: PublicQuestion
  index: number
  total: number
  selectedId: string | null
  result: AnswerResult | null
  submitting: boolean
  onSelect: (optionId: string) => void
  onSubmit: () => void
}

/** One question. After submission the answer is locked and green/red states carry text + icons, not only colour. */
export function QuestionCard({ question, index, total, selectedId, result, submitting, onSelect, onSubmit }: Props) {
  const locked = result !== null
  return (
    <Card className="p-5 md:p-7">
      <p className="text-sm font-medium text-slate-500">Question {index + 1} of {total}</p>
      <h2 className="mt-2 whitespace-pre-line text-lg font-semibold leading-snug md:text-xl">{question.question_text}</h2>
      <div role="radiogroup" aria-label="Answer choices" className="mt-5 space-y-2">
        {question.options.map((o) => {
          const isSelected = selectedId === o.id
          const isCorrect = locked && result.correct_option_id === o.id
          const isWrongPick = locked && isSelected && !result.is_correct
          let style = 'border-slate-200 bg-white hover:border-brand-200 hover:bg-brand-50'
          if (isSelected && !locked) style = 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
          if (isCorrect) style = 'border-green-600 bg-green-50'
          if (isWrongPick) style = 'border-red-600 bg-red-50'
          return (
            <button key={o.id} type="button" role="radio" aria-checked={isSelected} disabled={locked}
              onClick={() => onSelect(o.id)}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-default ${style}`}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white text-sm font-bold text-slate-700 ring-1 ring-slate-300">{o.option_label}</span>
              <span className="flex-1 pt-0.5">{o.option_text}</span>
              {isCorrect && <span className="flex items-center gap-1 text-sm font-semibold text-green-700"><Check className="h-4 w-4" aria-hidden />Correct answer</span>}
              {isWrongPick && <span className="flex items-center gap-1 text-sm font-semibold text-red-700"><X className="h-4 w-4" aria-hidden />Your answer</span>}
            </button>
          )
        })}
      </div>

      {locked ? (
        <div role="status" className={`mt-5 rounded-lg p-4 ${result.is_correct ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'}`}>
          <p className="flex items-center gap-2 font-semibold">
            {result.is_correct ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
            {result.is_correct ? 'Correct!' : 'Incorrect'}
          </p>
          {result.explanation && <p className="mt-1 text-sm">{result.explanation}</p>}
        </div>
      ) : (
        <div className="mt-5">
          <Button onClick={onSubmit} disabled={!selectedId} loading={submitting}>Check answer</Button>
        </div>
      )}
    </Card>
  )
}
