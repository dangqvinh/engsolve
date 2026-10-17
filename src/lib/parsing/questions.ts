import type { ParsedOption, ParsedQuestion } from './types'

const LETTERS = 'ABCDEFGH'
const QUESTION_RE = /^(?:(?:question|q|câu)\s*)?(\d{1,3})\s*[.):]\s*(.*)$/i
const QUESTION_WORD_RE = /^(?:question|q)\s+(\d{1,3})\s*[.):]?\s*(.*)$/i
const INLINE_OPTION_RE = /(?:\(([A-H])\)|([A-H])[.)]|([A-H])\s*:)(?=\s|:)/gi
const NON_QUESTION_LINE_RE = /^(?:part\s+\d+\b|section\s+\d+\b|directions?\s*:|instructions?\s*:|questions?\s+\d+\s*(?:-|–|to)\s*\d+\b|choose the (?:best|correct) answer\b|select the (?:best|correct) answer\b|page\s+\d+(?:\s+of\s+\d+)?\b|copyright\b|www\.)/i

export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/(^|\s)[{[]([A-H])[)\]}]/gim, '$1($2)')
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

  const appendText = (text: string) => {
    if (!cur || !text.trim() || NON_QUESTION_LINE_RE.test(text.trim())) return
    const value = text.trim()
    if (cur.options.length > 0) {
      const last = cur.options[cur.options.length - 1]
      last.text = `${last.text} ${value}`.trim()
    } else {
      cur.text = `${cur.text} ${value}`.trim()
    }
  }

  const appendContent = (text: string) => {
    if (!cur) return
    let cursor = 0
    let match: RegExpExecArray | null
    let foundOption = false
    INLINE_OPTION_RE.lastIndex = 0
    while ((match = INLINE_OPTION_RE.exec(text)) !== null) {
      const expected = LETTERS[cur.options.length]
      const label = (match[1] ?? match[2] ?? match[3])?.toUpperCase()
      if (label !== expected) continue
      appendText(text.slice(cursor, match.index))
      cur.options.push({ label: expected, text: '' })
      if (text[INLINE_OPTION_RE.lastIndex] === ':') INLINE_OPTION_RE.lastIndex++
      while (/\s/.test(text[INLINE_OPTION_RE.lastIndex] ?? '')) INLINE_OPTION_RE.lastIndex++
      cursor = INLINE_OPTION_RE.lastIndex
      foundOption = true
    }
    appendText(foundOption ? text.slice(cursor) : text)
  }

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

    // A new numbered question starts a fresh question, even when its choices follow inline.
    const qm = t.match(QUESTION_WORD_RE) ?? t.match(QUESTION_RE)
    if (qm) {
      const n = Number(qm[1])
      const plausible = !cur || n === lastNumber + 1 || cur.options.length >= 2
      if (plausible) {
        finish()
        lastNumber = n
        cur = { number: n, text: '', options: [], warnings: [] }
        appendContent(qm[2])
        sawBlank = false
        continue
      }
    }

    // A paragraph break after a complete question can introduce an unnumbered question.
    if (cur && cur.options.length >= 2 && sawBlank) {
      finish()
      cur = { number: null, text: t, options: [], warnings: ['No question number found'] }
      sawBlank = false
      continue
    }

    appendContent(t)
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
