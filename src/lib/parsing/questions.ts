import type { ParsedOption, ParsedQuestion } from './types'

const LETTERS = 'ABCDEFGH'
const OPTION_RE = /^\(?([A-Ha-h])[.)]\s+(\S.*)$/
const QUESTION_RE = /^(?:(?:question|q|câu)\s*)?(\d{1,3})\s*[.):]\s*(.*)$/i
const QUESTION_WORD_RE = /^(?:question|q)\s+(\d{1,3})\s*[.):]?\s*(.*)$/i

export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Deterministic multiple-choice parser. It prefers flagging a question over guessing:
 * choices must appear in sequence (A, B, C…) so "A. " inside prose is not mistaken for a choice.
 */
export function parseQuestions(raw: string): ParsedQuestion[] {
  const lines = normalizeText(raw).split('\n')
  const out: ParsedQuestion[] = []
  let cur: ParsedQuestion | null = null
  let lastNumber = 0
  let sawBlank = false

  const finish = () => {
    if (cur) out.push(finalize(cur))
    cur = null
  }

  for (const line of lines) {
    const t = line.trim()
    if (!t) {
      sawBlank = true
      continue
    }

    // 1) A new choice?
    const om = t.match(OPTION_RE)
    if (cur && om) {
      const expected = LETTERS[cur.options.length]
      if (om[1].toUpperCase() === expected) {
        cur.options.push({ label: expected, text: om[2].trim() })
        sawBlank = false
        continue
      }
    }

    // 2) A new numbered question?
    const qm = t.match(QUESTION_WORD_RE) ?? t.match(QUESTION_RE)
    if (qm && !om) {
      const n = Number(qm[1])
      const plausible = !cur || n === lastNumber + 1 || cur.options.length >= 2
      if (plausible) {
        finish()
        lastNumber = n
        cur = { number: n, text: qm[2].trim(), options: [], warnings: [] }
        sawBlank = false
        continue
      }
    }

    // 3) Unnumbered question: a paragraph break after a complete question.
    if (cur && cur.options.length >= 2 && sawBlank && !om) {
      finish()
      cur = { number: null, text: t, options: [], warnings: ['No question number found'] }
      sawBlank = false
      continue
    }

    // 4) Otherwise it is a continuation line.
    if (!cur) {
      if (!om) {
        cur = { number: null, text: t, options: [], warnings: ['No question number found'] }
      }
      sawBlank = false
      continue
    }
    if (cur.options.length > 0) {
      const last = cur.options[cur.options.length - 1]
      last.text = `${last.text} ${t}`.trim()
    } else {
      cur.text = `${cur.text} ${t}`.trim()
    }
    sawBlank = false
  }
  finish()
  // Keep only blocks that actually look like questions; stray headings are dropped.
  return out.filter((q) => q.options.length > 0 || q.number !== null)
}

function finalize(q: ParsedQuestion): ParsedQuestion {
  const warnings = [...q.warnings]
  if (!q.text) warnings.push('Question text is empty')
  if (q.options.length === 0) warnings.push('No answer choices found')
  else if (q.options.length < 2) warnings.push('Only one answer choice found')
  return { ...q, text: q.text.trim(), options: q.options.map(cleanOption), warnings }
}

function cleanOption(o: ParsedOption): ParsedOption {
  return { label: o.label, text: o.text.trim() }
}
