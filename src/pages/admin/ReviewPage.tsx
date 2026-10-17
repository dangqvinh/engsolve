import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, Sparkles } from 'lucide-react'
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, PageLoading, inputClass } from '../../components/ui'
import { PreviewPanel } from '../../features/admin/PreviewPanel'
import { QuestionEditor } from '../../features/admin/QuestionEditor'
import { useAuth } from '../../features/auth/AuthProvider'
import { useAsync } from '../../features/exercises/useAsync'
import { errorMessage } from '../../lib/errors'
import { validateDraftQuestion } from '../../lib/parsing'
import { addQuestion, deleteExercise, deleteQuestion, generateAnswers, getAdminExercise, setPublished, swapQuestionOrder, updateExerciseMeta } from '../../services/admin'
import type { AdminQuestion } from '../../types'

type Filter = 'all' | 'needs_review' | 'ai' | 'key' | 'invalid'
const FILTERS: [Filter, string][] = [['all', 'All'], ['needs_review', 'Needs review'], ['ai', 'AI-suggested'], ['key', 'Answer-key matches'], ['invalid', 'Invalid or incomplete']]
const GENERATION_STALE_AFTER_MS = 10 * 60 * 1000

const invalid = (q: AdminQuestion) => validateDraftQuestion({
  text: q.question_text, options: q.options.map((o) => ({ text: o.option_text })),
  correctIndex: (() => { const i = q.options.findIndex((o) => o.id === q.answer.correct_option_id); return i >= 0 ? i : null })(),
}).length > 0

export default function ReviewPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { session } = useAuth()
  const { data, error, loading, reload } = useAsync(() => getAdminExercise(id), [id])
  const [filter, setFilter] = useState<Filter>('all')
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'warning'; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ kind: 'exercise' } | { kind: 'question'; id: string } | null>(null)
  const [meta, setMeta] = useState<{ title: string; description: string } | null>(null)
  const preview = params.get('preview') === '1'
  const processingStatus = data?.source?.processing_status

  useEffect(() => {
    if (processingStatus !== 'generating_answers') return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload()
    }, 8000)
    return () => window.clearInterval(timer)
  }, [processingStatus, reload])

  const questions = useMemo(() => data?.questions ?? [], [data])
  const shown = useMemo(() => questions.filter((q) => {
    const s = q.answer.answer_source
    switch (filter) {
      case 'needs_review': return q.answer.needs_review
      case 'ai': return s === 'gemini_ai'
      case 'key': return s === 'embedded_answer_key' || s === 'uploaded_answer_key'
      case 'invalid': return invalid(q)
      default: return true
    }
  }), [questions, filter])

  if (loading && !data) return <PageLoading />
  if (error) return <Alert>{error}</Alert>
  if (!data) return <EmptyState title="Exercise not found" />
  const { exercise, source } = data
  const generationStale = source?.processing_status === 'generating_answers'
    && Date.now() - Date.parse(source.updated_at) > GENERATION_STALE_AFTER_MS
  const generationRunning = source?.processing_status === 'generating_answers' && !generationStale
  const userId = session?.user.id ?? ''
  const m = meta ?? { title: exercise.title, description: exercise.description ?? '' }
  const unanswered = questions.filter((q) => !q.answer.correct_option_id && q.options.length >= 2).length

  const act = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key); setMsg(null)
    try { const text = await fn(); if (text) setMsg({ tone: 'success', text }); await reload() }
    catch (e) { setMsg({ tone: 'danger', text: errorMessage(e) }); await reload() } finally { setBusy(null); setConfirm(null) }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Review exercise</h1>
        <Badge tone={exercise.status === 'published' ? 'success' : 'warning'}>{exercise.status === 'published' ? 'Published' : 'Draft'}</Badge>
        {source?.ocr_used && <Badge tone="warning">OCR text</Badge>}
        {source?.processing_status === 'failed' && <Badge tone="danger">Last processing step failed</Badge>}
      </div>
      {source?.processing_error && <div className="mt-3"><Alert tone="warning" title="Processing note">{source.processing_error}</Alert></div>}
      {generationRunning && <div className="mt-3"><Alert tone="warning" title="Generating answers">This may take a few minutes. The page checks for completion automatically; you can switch tabs and return later.</Alert></div>}
      {generationStale && <div className="mt-3"><Alert tone="warning" title="Answer generation may have stopped">No completion was recorded for this run. You can retry; answers already generated will be kept.</Alert></div>}
      {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}

      <Card className="mt-4 space-y-3 p-4">
        <label className="block text-sm font-medium">Title<input className={`${inputClass} mt-1`} value={m.title} maxLength={200} onChange={(e) => setMeta({ ...m, title: e.target.value })} /></label>
        <label className="block text-sm font-medium">Description<textarea className={`${inputClass} mt-1`} rows={2} maxLength={2000} value={m.description} onChange={(e) => setMeta({ ...m, description: e.target.value })} /></label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!meta || !m.title.trim()} loading={busy === 'meta'} onClick={() => void act('meta', async () => { await updateExerciseMeta(id, m.title, m.description); setMeta(null); return 'Details saved.' })}>Save details</Button>
          {exercise.status === 'published'
            ? <Button variant="secondary" loading={busy === 'pub'} onClick={() => void act('pub', async () => { await setPublished(id, false); return 'Unpublished. Learners can no longer see this exercise.' })}>Unpublish</Button>
            : <Button loading={busy === 'pub'} onClick={() => void act('pub', async () => { await setPublished(id, true); return 'Published. Learners can now practise this exercise.' })}>Publish</Button>}
          <Button variant="secondary" onClick={() => setParams(preview ? {} : { preview: '1' })}>{preview ? 'Back to editing' : 'Preview'}</Button>
          <Button variant="secondary" disabled={unanswered === 0 || generationRunning} loading={busy === 'ai'} onClick={() => void act('ai', async () => {
            const r = await generateAnswers(id); return r.message ?? `Gemini suggested ${r.updated} answer(s)${r.skipped ? `, ${r.skipped} need manual work` : ''}${r.remaining ? `. ${r.remaining} more remain: run it again.` : '.'}` })}>
            <Sparkles className="h-4 w-4" aria-hidden />{generationRunning ? 'Generating answers…' : source?.processing_status === 'failed' || generationStale ? 'Retry suggesting answers' : 'Suggest answers'}{unanswered > 0 ? ` (${unanswered})` : ''}
          </Button>
          <Button variant="ghost" className="ml-auto text-red-700" onClick={() => setConfirm({ kind: 'exercise' })}>Delete exercise</Button>
        </div>
        <p className="text-xs text-slate-500">Publishing requires every question to have valid text, at least two choices, one correct answer and your approval.</p>
      </Card>

      {preview ? <div className="mt-6"><PreviewPanel questions={questions} /></div> : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filter questions">
            {FILTERS.map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
                className={`rounded-full px-3 py-1 text-sm font-medium ${filter === f ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50'}`}>{label}</button>
            ))}
            <Button variant="secondary" className="ml-auto" loading={busy === 'add'} onClick={() => void act('add', async () => { await addQuestion(id, (questions.at(-1)?.question_order ?? 0) + 1); return 'Question added at the end.' })}><Plus className="h-4 w-4" aria-hidden />Add question</Button>
          </div>
          <div className="mt-4 space-y-4">
            {questions.length === 0 && <EmptyState title="No questions yet">Nothing was detected automatically. Add questions manually.</EmptyState>}
            {questions.length > 0 && shown.length === 0 && <EmptyState title="No questions match this filter" />}
            {shown.map((q) => {
              const i = questions.findIndex((x) => x.id === q.id)
              const sig = JSON.stringify([q.question_text, q.options.map((o) => [o.id, o.option_text]), q.answer])
              return (
                <QuestionEditor key={`${q.id}:${sig}`} question={q} index={i} count={questions.length} userId={userId}
                  onSaved={() => { setMsg({ tone: 'success', text: `Question ${i + 1} saved.` }); void reload() }}
                  onMove={(dir) => { const other = questions[i + dir]; if (other) void act('move', () => swapQuestionOrder({ id: q.id, order: q.question_order }, { id: other.id, order: other.question_order })) }}
                  onDelete={() => setConfirm({ kind: 'question', id: q.id })} />
              )
            })}
          </div>
        </>
      )}

      <ConfirmDialog open={!!confirm} busy={!!busy}
        title={confirm?.kind === 'exercise' ? 'Delete this exercise?' : 'Delete this question?'}
        message={confirm?.kind === 'exercise' ? 'The exercise, all its questions and its stored PDFs will be permanently deleted.' : 'This question and its choices will be permanently deleted.'}
        confirmLabel="Delete"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === 'exercise') void (async () => { setBusy('del'); try { await deleteExercise(id); navigate('/admin/exercises') } catch (e) { setMsg({ tone: 'danger', text: errorMessage(e) }); setBusy(null); setConfirm(null) } })()
          else if (confirm) void act('del', async () => { await deleteQuestion(confirm.id); return 'Question deleted.' })
        }} />
    </div>
  )
}
