import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, Minus, RotateCcw, X } from 'lucide-react'
import { Alert, Card, EmptyState, PageLoading } from '../components/ui'
import { errorMessage } from '../lib/errors'
import { completeAttempt, getPublishedExercise, loadToken } from '../services/practice'
import type { AttemptResult, Exercise, PublicQuestion } from '../types'

export default function ResultsPage() {
  const { attemptId = '' } = useParams()
  const [data, setData] = useState<{ result: AttemptResult; exercise: Exercise | null; questions: PublicQuestion[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [noToken, setNoToken] = useState(false)

  useEffect(() => {
    const token = loadToken(attemptId)
    if (!token) { setNoToken(true); return }
    ;(async () => {
      try {
        // complete-attempt is idempotent, so reloading this page simply re-reads the stored result.
        const result = await completeAttempt(attemptId, token)
        const loaded = await getPublishedExercise(result.exercise_id)
        setData({ result, exercise: loaded?.exercise ?? null, questions: loaded?.questions ?? [] })
      } catch (e) { setError(errorMessage(e)) }
    })()
  }, [attemptId])

  if (noToken) return <EmptyState title="Results not found" action={<Link className="font-semibold text-brand-700 hover:underline" to="/exercises">Browse exercises</Link>}>Results are only available in the browser tab where you finished the exercise.</EmptyState>
  if (error) return <Alert title="Could not load your results">{error}</Alert>
  if (!data) return <PageLoading />

  const { result, exercise, questions } = data
  const reviewBy = new Map(result.review.map((r) => [r.question_id, r]))
  const stat = (label: string, value: string | number) => (
    <Card className="p-4 text-center"><p className="text-2xl font-extrabold">{value}</p><p className="text-sm text-slate-600">{label}</p></Card>
  )
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{exercise?.title ?? 'Results'}</h1>
      <p className="mt-4 text-5xl font-extrabold text-brand-700">{result.percentage}%</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat('Total', result.total)}{stat('Correct', result.correct)}{stat('Incorrect', result.incorrect)}{stat('Unanswered', result.unanswered)}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to={`/exercises/${result.exercise_id}/practice`} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"><RotateCcw className="h-4 w-4" aria-hidden />Retry exercise</Link>
        <Link to="/exercises" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">Back to exercises</Link>
      </div>

      <h2 className="mt-10 text-xl font-bold">Review your answers</h2>
      <ol className="mt-4 space-y-4">
        {questions.map((q, i) => {
          const r = reviewBy.get(q.id)
          const label = (id: string | null | undefined) => q.options.find((o) => o.id === id)
          const picked = label(r?.selected_option_id); const correct = label(r?.correct_option_id)
          const status = r?.is_correct === true ? 'correct' : r?.is_correct === false ? 'incorrect' : 'unanswered'
          const Icon = status === 'correct' ? Check : status === 'incorrect' ? X : Minus
          const tone = status === 'correct' ? 'text-green-700' : status === 'incorrect' ? 'text-red-700' : 'text-slate-500'
          return (
            <li key={q.id}><Card className="p-4">
              <p className={`flex items-center gap-2 text-sm font-semibold ${tone}`}><Icon className="h-4 w-4" aria-hidden />Question {i + 1}: {status}</p>
              <p className="mt-1 whitespace-pre-line font-medium">{q.question_text}</p>
              <dl className="mt-2 space-y-1 text-sm">
                <div><dt className="inline font-semibold">Your answer: </dt><dd className="inline">{picked ? `${picked.option_label}. ${picked.option_text}` : 'No answer'}</dd></div>
                <div><dt className="inline font-semibold">Correct answer: </dt><dd className="inline">{correct ? `${correct.option_label}. ${correct.option_text}` : 'Not available'}</dd></div>
              </dl>
              {r?.explanation && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{r.explanation}</p>}
            </Card></li>
          )
        })}
      </ol>
    </div>
  )
}
