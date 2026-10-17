import { supabase } from '../lib/supabase'
import type { ParsedQuestion } from '../lib/parsing'
import type { AdminQuestion, AnswerSource, Exercise, ProcessingStatus, QuestionAnswer } from '../types'
import { callFunction } from './functions'

const BUCKET = 'exercise-pdfs'
const LETTERS = 'ABCDEFGH'
const ok = <T,>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message)
  return r.data
}
/** Like ok(), for inserts that must return a row. */
const one = <T,>(r: { data: T; error: { message: string } | null }): NonNullable<T> => {
  const v = ok(r)
  if (v === null || v === undefined) throw new Error('The server returned no data.')
  return v as NonNullable<T>
}

// ───────── dashboard + lists ─────────
export async function getStats() {
  const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const r = await q
    if (r.error) throw new Error(r.error.message)
    return r.count ?? 0
  }
  const [total, published, questions] = await Promise.all([
    count(supabase.from('exercises').select('id', { count: 'exact', head: true })),
    count(supabase.from('exercises').select('id', { count: 'exact', head: true }).eq('status', 'published')),
    count(supabase.from('questions').select('id', { count: 'exact', head: true })),
  ])
  return { total, published, drafts: total - published, questions }
}

export interface AdminExerciseRow extends Exercise { question_count: number; processing_status: ProcessingStatus | null }

export async function listAdminExercises(limit?: number): Promise<AdminExerciseRow[]> {
  let q = supabase.from('exercises')
    .select('id,title,description,status,created_at,updated_at,published_at,questions(count),exercise_sources(processing_status)')
    .order('updated_at', { ascending: false })
  if (limit) q = q.limit(limit)
  const rows = ok(await q) as unknown as (Exercise & { questions: { count: number }[]; exercise_sources: { processing_status: ProcessingStatus } | { processing_status: ProcessingStatus }[] | null })[]
  return rows.map(({ questions, exercise_sources, ...e }) => {
    const src = Array.isArray(exercise_sources) ? exercise_sources[0] : exercise_sources
    return { ...e, question_count: questions?.[0]?.count ?? 0, processing_status: src?.processing_status ?? null }
  })
}

export interface AdminExerciseDetail {
  exercise: Exercise
  source: { processing_status: ProcessingStatus; processing_error: string | null; updated_at: string; ocr_used: boolean; original_extracted_text: string | null; metadata: Record<string, unknown> } | null
  questions: AdminQuestion[]
}

export async function getAdminExercise(id: string): Promise<AdminExerciseDetail | null> {
  const exercise = ok(await supabase.from('exercises').select('*').eq('id', id).maybeSingle()) as Exercise | null
  if (!exercise) return null
  const source = ok(await supabase.from('exercise_sources')
    .select('processing_status,processing_error,updated_at,ocr_used,original_extracted_text,metadata').eq('exercise_id', id).maybeSingle()) as AdminExerciseDetail['source']
  const rows = ok(await supabase.from('questions')
    .select('id,question_text,question_order,options:question_options(id,option_label,option_text,option_order),answer:question_answers(correct_option_id,explanation,answer_source,ai_confidence,needs_review,validation_notes)')
    .eq('exercise_id', id).order('question_order')) as unknown as (Omit<AdminQuestion, 'answer'> & { answer: QuestionAnswer | QuestionAnswer[] | null })[]
  const empty: QuestionAnswer = { correct_option_id: null, explanation: null, answer_source: null, ai_confidence: null, needs_review: true, validation_notes: [] }
  const questions = rows.map((q) => {
    const a = Array.isArray(q.answer) ? q.answer[0] : q.answer
    return { ...q, options: [...(q.options ?? [])].sort((x, y) => x.option_order - y.option_order), answer: a ?? empty }
  })
  return { exercise, source, questions }
}

// ───────── create from parsed PDF ─────────
export interface CreateExerciseInput {
  title: string
  description: string
  userId: string
  parsed: ParsedQuestion[]
  keyLabels: (string | null)[] | null
  keySource: AnswerSource | null
  keyNotes: string[]
  extractedText: string
  keyText: string | null
  fileHash: string
  ocrUsed: boolean
  metadata: Record<string, unknown>
}

export async function createExerciseFromParsed(input: CreateExerciseInput): Promise<string> {
  const ex = one(await supabase.from('exercises').insert({ title: input.title, description: input.description || null, created_by: input.userId }).select('id').single())
  const exerciseId = ex.id as string
  try {
    ok(await supabase.from('exercise_sources').insert({
      exercise_id: exerciseId, processing_status: 'extracted', source_file_hash: input.fileHash,
      original_extracted_text: input.extractedText, answer_key_text: input.keyText, ocr_used: input.ocrUsed, metadata: input.metadata,
    }))
    if (input.parsed.length === 0) return exerciseId

    const qRows = ok(await supabase.from('questions')
      .insert(input.parsed.map((q, i) => ({ exercise_id: exerciseId, question_text: q.text, question_order: i + 1 })))
      .select('id,question_order')) as { id: string; question_order: number }[]
    const qIdByOrder = new Map(qRows.map((r) => [r.question_order, r.id]))

    const optRows = input.parsed.flatMap((q, i) => q.options.map((o, j) => ({
      question_id: qIdByOrder.get(i + 1)!, option_label: o.label, option_text: o.text, option_order: j,
    })))
    const savedOpts = optRows.length
      ? (ok(await supabase.from('question_options').insert(optRows).select('id,question_id,option_label')) as { id: string; question_id: string; option_label: string }[])
      : []

    const answerRows = input.parsed.map((q, i) => {
      const qid = qIdByOrder.get(i + 1)!
      const label = input.keyLabels?.[i] ?? null
      const opt = label ? savedOpts.find((o) => o.question_id === qid && o.option_label === label) : undefined
      return {
        question_id: qid,
        correct_option_id: opt?.id ?? null,
        answer_source: opt ? input.keySource : null,
        needs_review: true,
        validation_notes: [...q.warnings, ...(opt ? input.keyNotes : [])],
      }
    })
    ok(await supabase.from('question_answers').insert(answerRows))
    return exerciseId
  } catch (e) {
    await supabase.from('exercises').delete().eq('id', exerciseId) // roll back: cascade removes partial data
    throw e
  }
}

export async function uploadSourcePdf(userId: string, exerciseId: string, file: File, kind: 'source' | 'answer-key') {
  const path = `${userId}/${exerciseId}/${kind}.pdf`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(`Could not store the PDF: ${error.message}`)
  const col = kind === 'source' ? 'source_file_path' : 'answer_key_file_path'
  ok(await supabase.from('exercise_sources').update({ [col]: path }).eq('exercise_id', exerciseId))
}

export async function findByHash(hash: string): Promise<{ id: string; title: string } | null> {
  const src = ok(await supabase.from('exercise_sources').select('exercise_id').eq('source_file_hash', hash).limit(1).maybeSingle()) as { exercise_id: string } | null
  if (!src) return null
  const ex = ok(await supabase.from('exercises').select('id,title').eq('id', src.exercise_id).maybeSingle()) as { id: string; title: string } | null
  return ex
}

// ───────── editing ─────────
export interface QuestionDraft {
  text: string
  options: { id?: string; text: string }[]
  correctIndex: number | null
  explanation: string
}

export async function saveQuestion(original: AdminQuestion, draft: QuestionDraft, userId: string, approve: boolean): Promise<void> {
  const keepIds = new Set(draft.options.map((o) => o.id).filter(Boolean) as string[])
  const removed = original.options.filter((o) => !keepIds.has(o.id)).map((o) => o.id)

  ok(await supabase.from('questions').update({ question_text: draft.text.trim() }).eq('id', original.id))
  if (removed.length) ok(await supabase.from('question_options').delete().in('id', removed))

  // Move existing options to temporary labels first so relabelling never collides with the unique (question, label) rule.
  for (const [i, o] of draft.options.entries()) {
    if (o.id) ok(await supabase.from('question_options').update({ option_label: `~${i}`, option_order: i }).eq('id', o.id))
  }
  const ids: string[] = []
  for (const [i, o] of draft.options.entries()) {
    if (o.id) {
      ok(await supabase.from('question_options').update({ option_label: LETTERS[i], option_text: o.text.trim() }).eq('id', o.id))
      ids.push(o.id)
    } else {
      const row = one(await supabase.from('question_options')
        .insert({ question_id: original.id, option_label: LETTERS[i], option_text: o.text.trim(), option_order: i }).select('id').single())
      ids.push(row.id as string)
    }
  }

  const correctId = draft.correctIndex === null ? null : ids[draft.correctIndex] ?? null
  const prev = original.answer
  const answerChanged = correctId !== prev.correct_option_id
  const contentChanged = answerChanged || draft.text.trim() !== original.question_text ||
    draft.explanation.trim() !== (prev.explanation ?? '') ||
    JSON.stringify(draft.options.map((o) => o.text.trim())) !== JSON.stringify(original.options.map((o) => o.option_text))
  const source: AnswerSource | null = answerChanged && correctId ? 'admin_manual' : prev.answer_source

  ok(await supabase.from('question_answers').upsert({
    question_id: original.id,
    correct_option_id: correctId,
    explanation: draft.explanation.trim() || null,
    answer_source: source,
    needs_review: approve ? false : contentChanged ? true : prev.needs_review,
    validation_notes: approve ? [] : prev.validation_notes,
    reviewed_by: approve ? userId : null,
    reviewed_at: approve ? new Date().toISOString() : null,
  }, { onConflict: 'question_id' }))
}

export async function addQuestion(exerciseId: string, order: number): Promise<void> {
  const q = one(await supabase.from('questions').insert({ exercise_id: exerciseId, question_text: '', question_order: order }).select('id').single())
  ok(await supabase.from('question_options').insert(['A', 'B', 'C', 'D'].map((l, i) => ({ question_id: q.id, option_label: l, option_text: '', option_order: i }))))
  ok(await supabase.from('question_answers').insert({ question_id: q.id, answer_source: null, needs_review: true, validation_notes: ['Added manually'] }))
}

export async function deleteQuestion(id: string): Promise<void> {
  ok(await supabase.from('questions').delete().eq('id', id))
}

export async function swapQuestionOrder(a: { id: string; order: number }, b: { id: string; order: number }): Promise<void> {
  ok(await supabase.from('questions').update({ question_order: b.order }).eq('id', a.id))
  ok(await supabase.from('questions').update({ question_order: a.order }).eq('id', b.id))
}

export async function updateExerciseMeta(id: string, title: string, description: string): Promise<void> {
  ok(await supabase.from('exercises').update({ title: title.trim(), description: description.trim() || null }).eq('id', id))
}

export async function deleteExercise(id: string): Promise<void> {
  const src = ok(await supabase.from('exercise_sources').select('source_file_path,answer_key_file_path').eq('exercise_id', id).maybeSingle()) as { source_file_path: string | null; answer_key_file_path: string | null } | null
  const paths = [src?.source_file_path, src?.answer_key_file_path].filter(Boolean) as string[]
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
  ok(await supabase.from('exercises').delete().eq('id', id))
}

export const setPublished = (exerciseId: string, publish: boolean) =>
  callFunction<{ status: string }>('publish-exercise', { exercise_id: exerciseId, action: publish ? 'publish' : 'unpublish' })

export const generateAnswers = (exerciseId: string) =>
  callFunction<{ updated: number; skipped: number; remaining: number; message?: string }>('generate-answers', { exercise_id: exerciseId })
