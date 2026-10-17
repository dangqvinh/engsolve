import { describe, it, expect } from 'vitest'
import { parseQuestions, parseAnswerKey, splitAnswerKey, matchAnswerKey, validateDraftQuestion } from './index'

const SAMPLE = `Grammar Practice

Question 1. Choose the correct answer.
She ___ to school every day.
A. go
B. goes
C. going
D. gone

2) The weather was so bad that
we stayed home all day.
A) true
B) false and it
 continues over two lines
C) maybe
D) none

Answer Key
1. B  2. C`

describe('parseQuestions', () => {
  const { body } = splitAnswerKey(SAMPLE)
  const qs = parseQuestions(body)
  it('finds both numbering styles', () => {
    expect(qs.map((q) => q.number)).toEqual([1, 2])
  })
  it('joins multi-line question text and options', () => {
    expect(qs[0].text).toContain('She ___ to school every day.')
    expect(qs[1].text).toBe('The weather was so bad that we stayed home all day.')
    expect(qs[1].options[1].text).toBe('false and it continues over two lines')
  })
  it('captures all four options in order', () => {
    expect(qs[0].options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D'])
  })
  it('does not treat out-of-sequence "A." as a choice', () => {
    const r = parseQuestions('1. Pick one\nA. one\nA. again\nB. two')
    expect(r[0].options.map((o) => o.label)).toEqual(['A', 'B'])
    expect(r[0].options[0].text).toBe('one A. again')
  })
  it('flags questions without enough options instead of inventing them', () => {
    const r = parseQuestions('1. Lonely question\nA. only one')
    expect(r[0].warnings).toContain('Only one answer choice found')
  })
  it('flags unnumbered questions split by blank lines', () => {
    const r = parseQuestions('1. First\nA. a\nB. b\n\nSecond one without number\nA. x\nB. y')
    expect(r).toHaveLength(2)
    expect(r[1].number).toBeNull()
    expect(r[1].warnings[0]).toMatch(/No question number/)
  })
  it('handles Windows line endings and nbsp', () => {
    const r = parseQuestions('1.\u00a0Hi\r\nA. a\r\nB. b')
    expect(r[0].options).toHaveLength(2)
  })
  it('splits OCR output when the stem and choices are on one line', () => {
    const r = parseQuestions(
      'Part 5: Choose the correct answer.\n101. Diners at the Appleton Buffet have commented favorably on ------- wide variety of seafood dishes. (A) we (B) us (C) our (D) ours\nPage 12',
    )
    expect(r).toHaveLength(1)
    expect(r[0].number).toBe(101)
    expect(r[0].text).toBe('Diners at the Appleton Buffet have commented favorably on ------- wide variety of seafood dishes.')
    expect(r[0].options).toEqual([
      { label: 'A', text: 'we' },
      { label: 'B', text: 'us' },
      { label: 'C', text: 'our' },
      { label: 'D', text: 'ours' },
    ])
  })
  it('parses numbered questions with colon-delimited parenthesized choices', () => {
    const r = parseQuestions(
      '101. Diners at the Appleton Buffet have commented favorably on ------- wide variety of seafood dishes.\n(A): we\n(B): us\n(C): our\n(D): ours\n102. Rev Furniture has high-quality handmade goods and reasonable delivery -------.\n(A): routines\n(B): trucks\n(C): duties\n(D): fees',
    )
    expect(r).toHaveLength(2)
    expect(r.map((question) => question.number)).toEqual([101, 102])
    expect(r[0].text).toBe('Diners at the Appleton Buffet have commented favorably on ------- wide variety of seafood dishes.')
    expect(r[0].options).toEqual([
      { label: 'A', text: 'we' },
      { label: 'B', text: 'us' },
      { label: 'C', text: 'our' },
      { label: 'D', text: 'ours' },
    ])
    expect(r[1].text).toBe('Rev Furniture has high-quality handmade goods and reasonable delivery -------.')
    expect(r[1].options.map((option) => option.text)).toEqual(['routines', 'trucks', 'duties', 'fees'])
  })
  it('normalizes OCR bracket errors around choice labels', () => {
    const r = parseQuestions('101. Select the answer.\n{A) one\n(B) two\n{C) three\n(D) four')
    expect(r[0].options).toEqual([
      { label: 'A', text: 'one' },
      { label: 'B', text: 'two' },
      { label: 'C', text: 'three' },
      { label: 'D', text: 'four' },
    ])
  })
  it('drops instruction lines rather than attaching them to a question or choice', () => {
    const r = parseQuestions(
      'Directions: Choose the best answer.\n1. Choose the correct answer.\nDiners commented favorably.\n(A) we\n(B) us\n(C) our\n(D) ours',
    )
    expect(r[0].text).toBe('Diners commented favorably.')
    expect(r[0].options[3].text).toBe('ours')
  })
})

describe('answer key', () => {
  it('splits the key from the body', () => {
    const { body, keyText } = splitAnswerKey(SAMPLE)
    expect(body).not.toMatch(/Answer Key/)
    expect(parseAnswerKey(keyText!)).toEqual({ 1: 'B', 2: 'C' })
  })
  it('returns no key when none is present', () => {
    expect(splitAnswerKey('1. Q\nA. a\nB. b').keyText).toBeNull()
  })
  it('parses varied formats', () => {
    expect(parseAnswerKey('1-A, 2) b; 3: (C)')).toEqual({ 1: 'A', 2: 'B', 3: 'C' })
  })
  it('matches by number and flags count mismatches', () => {
    const qs = parseQuestions('1. a\nA. x\nB. y\n2. b\nA. x\nB. y')
    const ok = matchAnswerKey(qs, { 1: 'A', 2: 'B' })
    expect(ok.labels).toEqual(['A', 'B'])
    expect(ok.uncertain).toBe(false)
    const bad = matchAnswerKey(qs, { 1: 'A' })
    expect(bad.uncertain).toBe(true)
  })
  it('refuses a key letter that is not a real choice', () => {
    const qs = parseQuestions('1. a\nA. x\nB. y')
    expect(matchAnswerKey(qs, { 1: 'D' }).labels).toEqual([null])
  })
})

describe('validateDraftQuestion', () => {
  it('requires text, 2+ options and exactly one selected answer', () => {
    expect(validateDraftQuestion({ text: '', options: [{ text: 'a' }], correctIndex: null })).toHaveLength(3)
    expect(validateDraftQuestion({ text: 'q', options: [{ text: 'a' }, { text: 'b' }], correctIndex: 1 })).toEqual([])
    expect(validateDraftQuestion({ text: 'q', options: [{ text: 'a' }, { text: ' ' }], correctIndex: 0 })).toEqual(['A choice is empty'])
  })
  it('rejects question text longer than the database limit', () => {
    expect(validateDraftQuestion({
      text: 'q'.repeat(4001),
      options: [{ text: 'a' }, { text: 'b' }],
      correctIndex: 0,
    })).toContain('Question text exceeds 4000 characters')
  })
  it('rejects choices longer than the database limit', () => {
    expect(validateDraftQuestion({
      text: 'question',
      options: [{ text: 'a'.repeat(1001) }, { text: 'b' }],
      correctIndex: 0,
    })).toContain('A choice exceeds 1000 characters')
  })
})
