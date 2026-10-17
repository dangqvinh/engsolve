import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react'
import { Alert, Button, ConfirmDialog, EmptyState, PageLoading } from '../components/ui'
import { QuestionCard } from '../features/practice/QuestionCard'
import { errorMessage } from '../lib/errors'
import { completeAttempt, getPublishedExercise, saveToken, startAttempt, submitAnswer } from '../services/practice'
import type { AnswerResult, AttemptStart, Exercise, PublicQuestion } from '../types'

export default function PracticePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState<{ exercise: Exercise; questions: PublicQuestion[] } | null>(null)
  const [attempt, setAttempt] = useState<AttemptStart | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, AnswerResult>>({})
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return // StrictMode double-invoke guard: one attempt per visit
    started.current = true
    ;(async () => {
      try {
        const loaded = await getPublishedExercise(id)
        if (!loaded) { setMissing(true); return }
        if (loaded.questions.length === 0) { setState(loaded); return }
        const a = await startAttempt(id) // each visit (including a retry) is a brand-new, isolated attempt
        saveToken(a.attempt_id, a.token)
        setState(loaded); setAttempt(a)
      } catch (e) { setLoadError(errorMessage(e)) } finally { setLoading(false) }
    })()
  }, [id])

  if (loading) return <PageLoading />
  if (loadError) return <Alert title="Could not start this exercise">{loadError}</Alert>
  if (missing) return <EmptyState title="Exercise not available" action={<Link className="font-semibold text-brand-700 hover:underline" to="/exercises">Browse exercises</Link>}>It may have been unpublished or removed.</EmptyState>
  if (!state || !attempt || state.questions.length === 0) return <EmptyState title="No questions yet">This exercise has no questions.</EmptyState>

  const { exercise, questions } = state
  const q = questions[index]
  const answeredCount = Object.keys(results).length

  const submit = async () => {
    const optionId = picked[q.id]
    if (!optionId) return
    setSubmitting(true); setActionError(null)
    try {
      const r = await submitAnswer({ attemptId: attempt.attempt_id, token: attempt.token, questionId: q.id, optionId })
      setResults((prev) => ({ ...prev, [q.id]: r }))
      setPicked((prev) => ({ ...prev, [q.id]: r.selected_option_id }))
    } catch (e) { setActionError(errorMessage(e)) } finally { setSubmitting(false) }
  }

  const finish = async () => {
    setFinishing(true); setActionError(null)
    try {
      await completeAttempt(attempt.attempt_id, attempt.token)
      navigate(`/results/${attempt.attempt_id}`)
    } catch (e) { setActionError(errorMessage(e)); setFinishing(false); setConfirmFinish(false) }
  }

  const isLast = index === questions.length - 1
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{exercise.title}</h1>
      {exercise.description && <p className="mt-1 text-slate-600">{exercise.description}</p>}

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answeredCount} aria-label="Answered questions">
        <div className="h-full bg-brand-600 transition-all" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
      </div>
      <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="Questions">
        {questions.map((qq, i) => {
          const r = results[qq.id]
          const tone = r ? (r.is_correct ? 'bg-green-100 text-green-800 ring-green-600' : 'bg-red-100 text-red-800 ring-red-600') : 'bg-white text-slate-600 ring-slate-300'
          return (
            <button key={qq.id} onClick={() => setIndex(i)} aria-current={i === index} aria-label={`Question ${i + 1}${r ? (r.is_correct ? ', correct' : ', incorrect') : ', unanswered'}`}
              className={`h-8 w-8 rounded-md text-xs font-semibold ring-1 ${tone} ${i === index ? 'outline-2 outline-offset-1 outline-brand-600' : ''}`}>{i + 1}</button>
          )
        })}
      </nav>

      <div className="mt-5">
        <QuestionCard question={q} index={index} total={questions.length} selectedId={picked[q.id] ?? null} result={results[q.id] ?? null} submitting={submitting}
          onSelect={(o) => setPicked((p) => ({ ...p, [q.id]: o }))} onSubmit={() => void submit()} />
      </div>
      {actionError && <div className="mt-3"><Alert>{actionError}</Alert></div>}

      <div className="mt-5 flex items-center justify-between">
        <Button variant="secondary" onClick={() => setIndex(index - 1)} disabled={index === 0}><ChevronLeft className="h-4 w-4" aria-hidden />Previous</Button>
        {isLast
          ? <Button onClick={() => (answeredCount < questions.length ? setConfirmFinish(true) : void finish())} loading={finishing}><Flag className="h-4 w-4" aria-hidden />Finish</Button>
          : <Button onClick={() => setIndex(index + 1)}>Next<ChevronRight className="h-4 w-4" aria-hidden /></Button>}
      </div>
      <ConfirmDialog open={confirmFinish} title="Finish with unanswered questions?" busy={finishing}
        message={`You have ${questions.length - answeredCount} unanswered question(s). They will count as unanswered in your score.`}
        confirmLabel="Finish anyway" onConfirm={() => void finish()} onCancel={() => setConfirmFinish(false)} />
    </div>
  )
}
