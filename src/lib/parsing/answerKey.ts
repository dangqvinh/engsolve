import type { AnswerKeyMap, ParsedQuestion } from './types'

const KEY_HEADING_RE = /^\s*(?:answer\s*key|answers?|key|đáp\s*án)\s*:?\s*$/im
const KEY_PAIR_RE = /(?:^|[\s,;])(\d{1,3})\s*[.):\-–]?\s*\(?([A-Ha-h])\)?(?![A-Za-z0-9])/g

/** Split exercise text into the body and a trailing answer-key section (if one is clearly marked). */
export function splitAnswerKey(text: string): { body: string; keyText: string | null } {
  const matches = [...text.matchAll(new RegExp(KEY_HEADING_RE.source, 'gim'))]
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]
    const start = m.index ?? 0
    const keyText = text.slice(start + m[0].length)
    if (Object.keys(parseAnswerKey(keyText)).length >= 2) {
      return { body: text.slice(0, start).trimEnd(), keyText }
    }
  }
  return { body: text, keyText: null }
}

/** Parse "1. A  2. C" / "1-A, 2-C" / "1) b" style keys. First occurrence of a number wins. */
export function parseAnswerKey(text: string): AnswerKeyMap {
  const map: AnswerKeyMap = {}
  for (const m of text.matchAll(KEY_PAIR_RE)) {
    const n = Number(m[1])
    if (!(n in map)) map[n] = m[2].toUpperCase()
  }
  return map
}

export interface KeyMatch {
  /** label per question index, or null if the key has nothing usable for it */
  labels: (string | null)[]
  uncertain: boolean
  notes: string[]
}

/** Match key entries to questions by number. Mismatched counts mark the whole mapping uncertain. */
export function matchAnswerKey(questions: ParsedQuestion[], key: AnswerKeyMap): KeyMatch {
  const notes: string[] = []
  const keyCount = Object.keys(key).length
  const numbered = questions.filter((q) => q.number !== null).length
  let uncertain = false
  if (keyCount !== questions.length) {
    uncertain = true
    notes.push(`Answer key has ${keyCount} entries but ${questions.length} questions were extracted.`)
  }
  if (numbered < questions.length) {
    uncertain = true
    notes.push('Some questions have no number, so key mapping is unreliable.')
  }
  const labels = questions.map((q) => {
    if (q.number === null) return null
    const label = key[q.number]
    if (!label) return null
    if (!q.options.some((o) => o.label === label)) {
      notes.push(`Question ${q.number}: key says ${label} but that choice does not exist.`)
      return null
    }
    return label
  })
  return { labels, uncertain, notes }
}
