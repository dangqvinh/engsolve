import { describe, it, expect } from 'vitest'
import { computeScore } from './scoring.ts'
import { validateAiAnswers } from './aiAnswers.ts'
import { validateForPublish } from './publish.ts'

describe('computeScore', () => {
  it('computes percentage and unanswered', () => {
    expect(computeScore({ totalQuestions: 10, correctCount: 7, answeredCount: 9 })).toEqual({
      total: 10, correct: 7, incorrect: 2, unanswered: 1, percentage: 70,
    })
  })
  it('handles zero questions without dividing by zero', () => {
    expect(computeScore({ totalQuestions: 0, correctCount: 0, answeredCount: 0 }).percentage).toBe(0)
  })
  it('clamps inconsistent input so a score can never exceed 100', () => {
    const r = computeScore({ totalQuestions: 3, correctCount: 99, answeredCount: 50 })
    expect(r.percentage).toBe(100)
    expect(r.unanswered).toBe(0)
  })
  it('rounds to 2 decimals', () => {
    expect(computeScore({ totalQuestions: 3, correctCount: 1, answeredCount: 3 }).percentage).toBe(33.33)
  })
})

describe('validateAiAnswers', () => {
  const qs = [{ index: 1, labels: ['A', 'B', 'C', 'D'] }, { index: 2, labels: ['A', 'B'] }]
  it('accepts valid items and forces needsReview', () => {
    const { valid } = validateAiAnswers([{ index: 1, correct_label: 'b', explanation: ' why ', confidence: 'high', needs_review: false }], qs)
    expect(valid).toEqual([{ index: 1, correctLabel: 'B', explanation: 'why', confidence: 'high', needsReview: true }])
  })
  it('rejects labels that are not choices instead of guessing', () => {
    const { valid, rejected } = validateAiAnswers([{ index: 2, correct_label: 'D', explanation: 'x' }], qs)
    expect(valid).toHaveLength(0)
    expect(rejected[0].reason).toMatch(/not one of the choices/)
  })
  it('rejects null labels, unknown indexes and duplicates', () => {
    const { valid, rejected } = validateAiAnswers(
      [{ index: 1, correct_label: null }, { index: 9, correct_label: 'A' }, { index: 2, correct_label: 'A' }, { index: 2, correct_label: 'B' }], qs)
    expect(valid.map((v) => v.index)).toEqual([2])
    expect(rejected).toHaveLength(3)
  })
  it('defaults unknown confidence to low and rejects non-list payloads', () => {
    expect(validateAiAnswers([{ index: 1, correct_label: 'A', confidence: 'certain' }], qs).valid[0].confidence).toBe('low')
    expect(validateAiAnswers('nope', qs).valid).toHaveLength(0)
  })
  it('accepts { answers: [...] } wrapper', () => {
    expect(validateAiAnswers({ answers: [{ index: 1, correct_label: 'C' }] }, qs).valid).toHaveLength(1)
  })
})

describe('validateForPublish', () => {
  const good = { id: 'q', question_text: 'Q?', options: [{ id: 'a', option_text: 'x' }, { id: 'b', option_text: 'y' }], correct_option_id: 'a', needs_review: false }
  it('passes a reviewed, valid question', () => expect(validateForPublish([good])).toEqual([]))
  it('blocks empty exercises', () => expect(validateForPublish([])).toHaveLength(1))
  it('blocks missing answer, unreviewed, and foreign correct option', () => {
    expect(validateForPublish([{ ...good, correct_option_id: null }])[0]).toMatch(/no correct answer/)
    expect(validateForPublish([{ ...good, needs_review: true }])[0]).toMatch(/not yet approved/)
    expect(validateForPublish([{ ...good, correct_option_id: 'zzz' }])[0]).toMatch(/not one of its choices/)
  })
})
