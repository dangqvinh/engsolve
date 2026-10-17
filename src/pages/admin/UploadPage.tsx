import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { Alert, Button, Card, inputClass } from '../../components/ui'
import { useAuth } from '../../features/auth/AuthProvider'
import { sha256, validatePdf } from '../../lib/files'
import { errorMessage } from '../../lib/errors'
import { matchAnswerKey, MAX_OPTION_TEXT_LENGTH, MAX_QUESTION_TEXT_LENGTH, parseAnswerKey, parseQuestions, splitAnswerKey } from '../../lib/parsing'
import { extractPdfText } from '../../lib/pdf/extract'
import { ocrPdf } from '../../lib/pdf/ocr'
import { createExerciseFromParsed, findByHash, generateAnswers, uploadSourcePdf } from '../../services/admin'
import type { AnswerSource } from '../../types'

interface Summary { exerciseId: string; questions: number; fromKey: number; flagged: number; warnings: string[]; ai: string | null; aiError: string | null }
const STEPS = ['Check files', 'Extract text', 'Find questions and answer key', 'Save draft', 'Suggest answers with Gemini']

async function textFromPdf(file: File, setDetail: (s: string) => void): Promise<{ text: string; ocr: boolean; warnings: string[] }> {
  const warnings: string[] = []
  const r = await extractPdfText(file, (p, t) => setDetail(`Reading page ${p} of ${t}`))
  if (!r.looksScanned) return { text: r.text, ocr: false, warnings }
  setDetail('Little embedded text found. Running OCR (this can take a while)…')
  const o = await ocrPdf(file, (p, t) => setDetail(`OCR page ${p} of ${t}`))
  if (o.truncated) warnings.push('Only the first pages were OCR-processed. Add the remaining questions manually.')
  warnings.push('Text came from OCR and may contain mistakes. Check every question carefully.')
  return { text: o.text, ocr: true, warnings }
}

export default function UploadPage() {
  const { session } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [keyFile, setKeyFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [useAi, setUseAi] = useState(true)
  const [step, setStep] = useState(-1)
  const [detail, setDetail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<{ id: string; title: string } | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const busy = step >= 0 && !summary && !error

  const run = async (force: boolean) => {
    if (!file || !session) return
    setError(null); setSummary(null); setDuplicate(null)
    try {
      setStep(0); setDetail('')
      for (const f of [file, keyFile]) {
        if (!f) continue
        const problem = await validatePdf(f)
        if (problem) throw new Error(`${f.name}: ${problem}`)
      }
      const hash = await sha256(file)
      const dup = await findByHash(hash)
      if (dup && !force) { setDuplicate(dup); setStep(-1); return }

      setStep(1)
      const main = await textFromPdf(file, setDetail)
      const warnings = [...main.warnings]
      if (main.text.replace(/\s/g, '').length < 20) throw new Error('No readable text could be extracted from this PDF. You can create an empty exercise and add questions manually, or try a clearer file.')

      setStep(2); setDetail('')
      const { body, keyText: embeddedKeyText } = splitAnswerKey(main.text)
      const parsed = parseQuestions(body)
      let keyText = embeddedKeyText
      let keySource: AnswerSource | null = embeddedKeyText ? 'embedded_answer_key' : null // Priority 1
      let keyOcr = false
      if (!keySource && keyFile) { // Priority 2
        const k = await textFromPdf(keyFile, setDetail)
        warnings.push(...k.warnings); keyOcr = k.ocr
        keyText = k.text
        if (Object.keys(parseAnswerKey(k.text)).length > 0) keySource = 'uploaded_answer_key'
        else warnings.push('No answers could be read from the answer-key PDF.')
      } else if (embeddedKeyText && keyFile) {
        warnings.push('The exercise PDF already contains an answer key, so the separate answer-key file was not used.')
      }
      const match = keySource && keyText ? matchAnswerKey(parsed, parseAnswerKey(keyText)) : null
      if (parsed.length === 0) warnings.push('No questions were detected. Add them manually on the review page.')
      if (match?.uncertain) warnings.push(...match.notes)
      const importable = parsed
        .map((question, index) => ({ question, index }))
        .filter(({ question }) =>
          question.text.length <= MAX_QUESTION_TEXT_LENGTH
          && question.options.every((option) => option.text.length <= MAX_OPTION_TEXT_LENGTH))
      const skipped = parsed.length - importable.length
      if (skipped > 0) {
        for (const { question, index } of parsed.map((question, index) => ({ question, index })).filter(({ question }) =>
          question.text.length > MAX_QUESTION_TEXT_LENGTH
          || question.options.some((option) => option.text.length > MAX_OPTION_TEXT_LENGTH))) {
          const label = question.number === null ? `Extracted question ${index + 1}` : `Question ${question.number}`
          const reason = question.text.length > MAX_QUESTION_TEXT_LENGTH
            ? `question text exceeds ${MAX_QUESTION_TEXT_LENGTH} characters`
            : `a choice exceeds ${MAX_OPTION_TEXT_LENGTH} characters`
          warnings.push(`${label} was not imported because ${reason}. The extracted PDF text is retained with the draft; split or correct the question and add it manually.`)
        }
      }
      const importableQuestions = importable.map(({ question }) => question)
      const importableKeyLabels = match ? importable.map(({ index }) => match.labels[index]) : null

      setStep(3); setDetail('')
      const keyNotes = match?.uncertain ? ['Answer-key mapping is uncertain. Verify this answer.'] : []
      const exerciseId = await createExerciseFromParsed({
        title: title.trim() || file.name.replace(/\.pdf$/i, ''), description: description.trim(), userId: session.user.id, parsed: importableQuestions,
        keyLabels: importableKeyLabels, keySource, keyNotes, extractedText: main.text, keyText,
        fileHash: hash, ocrUsed: main.ocr || keyOcr, metadata: { pages_note: 'extracted in browser', file_name: file.name },
      })
      await uploadSourcePdf(session.user.id, exerciseId, file, 'source')
      if (keyFile) await uploadSourcePdf(session.user.id, exerciseId, keyFile, 'answer-key')

      const fromKey = importableKeyLabels?.filter(Boolean).length ?? 0
      const needAi = importableQuestions.filter((q, i) => q.options.length >= 2 && !importableKeyLabels?.[i]).length
      let ai: string | null = null; let aiError: string | null = null
      if (useAi && needAi > 0) {
        setStep(4); setDetail('Asking Gemini…')
        try {
          const r = await generateAnswers(exerciseId)
          ai = `Gemini suggested ${r.updated} answer(s)${r.skipped ? `; ${r.skipped} could not be answered` : ''}${r.remaining ? `; ${r.remaining} more remain, press “Suggest answers” on the review page` : ''}.`
        } catch (e) { aiError = errorMessage(e) } // extracted data is already saved; admin can retry or edit manually
      }
      setSummary({ exerciseId, questions: importableQuestions.length, fromKey, flagged: importableQuestions.filter((q) => q.warnings.length).length, warnings, ai, aiError })
      setStep(STEPS.length)
    } catch (e) {
      setError(errorMessage(e)); setStep(-1)
    }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void run(false) }
  const fileInput = (label: string, hint: string, f: File | null, set: (f: File | null) => void) => (
    <label className="block text-sm font-medium">{label}
      <input type="file" accept="application/pdf,.pdf" disabled={busy} className={`${inputClass} mt-1 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:font-semibold file:text-brand-700`}
        onChange={(e) => set(e.target.files?.[0] ?? null)} />
      <span className="mt-1 block text-xs font-normal text-slate-500">{f ? f.name : hint}</span>
    </label>
  )
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Upload PDF</h1>
      <p className="mt-1 text-sm text-slate-600">Text is read in your browser. Only the extracted questions and the PDFs themselves are saved. Everything is saved as a draft for you to review.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {fileInput('Exercise PDF', 'Required. PDF only, up to 10 MB.', file, setFile)}
        {fileInput('Answer-key PDF (optional)', 'Only used if the exercise PDF has no answer key of its own.', keyFile, setKeyFile)}
        <label className="block text-sm font-medium">Title (optional)
          <input className={`${inputClass} mt-1`} value={title} maxLength={200} disabled={busy} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the file name" />
        </label>
        <label className="block text-sm font-medium">Description (optional)
          <textarea className={`${inputClass} mt-1`} rows={2} maxLength={2000} disabled={busy} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={useAi} disabled={busy} onChange={(e) => setUseAi(e.target.checked)} />
          <span>Suggest answers with Gemini for questions that have no answer key. Suggestions are never final until you approve them.</span></label>
        <Button type="submit" disabled={!file} loading={busy}>Upload and extract</Button>
      </form>

      {duplicate && <div className="mt-4"><Alert tone="warning" title="This PDF was already uploaded">
        It matches “{duplicate.title}”. <Link className="font-semibold underline" to={`/admin/exercises/${duplicate.id}`}>Open it</Link> or <button className="font-semibold underline" onClick={() => void run(true)}>upload it again anyway</button>.</Alert></div>}
      {error && <div className="mt-4"><Alert title="Upload stopped">{error}</Alert></div>}

      {step >= 0 && (
        <Card className="mt-6 p-4">
          <ol className="space-y-2 text-sm">
            {STEPS.map((s, i) => {
              if (i === 4 && !useAi) return null
              const done = step > i; const active = step === i && !error && !summary
              return (
                <li key={s} className="flex items-center gap-2">
                  {done ? <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden /> : active ? <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden /> : <Circle className="h-4 w-4 text-slate-300" aria-hidden />}
                  <span className={done || active ? 'font-medium' : 'text-slate-500'}>{s}{active && detail ? ` — ${detail}` : ''}</span>
                </li>
              )
            })}
          </ol>
        </Card>
      )}
      {summary && (
        <div className="mt-4 space-y-3">
          <Alert tone="success" title="Draft created">
            {summary.questions} question(s) found, {summary.fromKey} matched from an answer key, {summary.flagged} flagged by the parser.
            {summary.ai && <> {summary.ai}</>}
          </Alert>
          {summary.aiError && <Alert tone="warning" title="Gemini step did not finish">{summary.aiError} Your questions are saved. You can retry from the review page or set answers by hand.</Alert>}
          {summary.warnings.map((w) => <Alert key={w} tone="warning">{w}</Alert>)}
          <Link to={`/admin/exercises/${summary.exerciseId}`} className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Review questions</Link>
        </div>
      )}
    </div>
  )
}
