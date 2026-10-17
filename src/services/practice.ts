import { supabase } from '../lib/supabase'
import type { AnswerResult, AttemptResult, AttemptStart, Exercise, ExerciseListItem, PublicQuestion } from '../types'
import { callFunction } from './functions'

export async function listPublished(limit?: number): Promise<ExerciseListItem[]> {
  let q = supabase.from('exercises')
    .select('id,title,description,status,created_at,updated_at,published_at,questions(count)')
    .eq('status', 'published').order('published_at', { ascending: false })
  if (limit) q = q.limit(limit)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((e) => {
    const { questions, ...rest } = e as unknown as Exercise & { questions: { count: number }[] }
    return { ...rest, question_count: questions?.[0]?.count ?? 0 }
  })
}

export async function getPublishedExercise(id: string): Promise<{ exercise: Exercise; questions: PublicQuestion[] } | null> {
  const { data: exercise, error } = await supabase.from('exercises')
    .select('id,title,description,status,created_at,updated_at,published_at').eq('id', id).eq('status', 'published').maybeSingle()
  if (error) throw error
  if (!exercise) return null
  const { data, error: qErr } = await supabase.from('questions')
    .select('id,question_text,question_order,options:question_options(id,option_label,option_text,option_order)')
    .eq('exercise_id', id).order('question_order')
  if (qErr) throw qErr
  const questions = (data ?? []).map((q) => ({
    ...q, options: [...(q.options ?? [])].sort((a, b) => a.option_order - b.option_order),
  })) as PublicQuestion[]
  return { exercise: exercise as Exercise, questions }
}

export const startAttempt = (exerciseId: string) => callFunction<AttemptStart>('start-attempt', { exercise_id: exerciseId })

export const submitAnswer = (a: { attemptId: string; token: string; questionId: string; optionId: string }) =>
  callFunction<AnswerResult>('submit-answer', { attempt_id: a.attemptId, token: a.token, question_id: a.questionId, option_id: a.optionId })

export const completeAttempt = (attemptId: string, token: string) =>
  callFunction<AttemptResult>('complete-attempt', { attempt_id: attemptId, token })

// The attempt secret lives only in this tab's sessionStorage.
const key = (id: string) => `engsolve:attempt:${id}`
export const saveToken = (id: string, token: string) => { try { sessionStorage.setItem(key(id), token) } catch { /* private mode */ } }
export const loadToken = (id: string): string | null => { try { return sessionStorage.getItem(key(id)) } catch { return null } }
