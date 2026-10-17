import { describe, expect, it } from 'vitest'
import {
  addSharedPassageToQuestions,
  extractSharedPassage,
  findColumnLayout,
  findColumnSplit,
  hasInterleavedQuestionStarts,
  trimColumnPreamble,
  trimQuestionBody,
} from './ocrLayout'

describe('findColumnSplit', () => {
  it('finds a wide blank gutter between two text columns', () => {
    const ink = Array.from({ length: 100 }, (_, x) => x < 43 || x > 56 ? 20 : 0)
    expect(findColumnSplit(ink, 100)).toBe(50)
  })

  it('does not mistake a single text column for a two-column page', () => {
    const ink = Array.from({ length: 100 }, (_, x) => x < 45 ? 20 : 0)
    expect(findColumnSplit(ink, 100)).toBeNull()
  })

  it('does not split on a narrow gap', () => {
    const ink = Array.from({ length: 100 }, (_, x) => x < 49 || x > 50 ? 20 : 0)
    expect(findColumnSplit(ink, 100)).toBeNull()
  })

  it('finds columns below a full-width heading from repeated vertical bands', () => {
    const columns = Array.from({ length: 100 }, (_, x) => x < 43 || x > 56 ? 20 : 0)
    expect(findColumnLayout([
      { inkByColumn: Array.from({ length: 100 }, () => 20), startY: 0.1 },
      { inkByColumn: columns, startY: 0.3 },
      { inkByColumn: columns, startY: 0.4 },
    ], 100)).toEqual({ split: 50, startY: 0.3 })
  })

  it('does not split a page based on one isolated blank band', () => {
    const columns = Array.from({ length: 100 }, (_, x) => x < 43 || x > 56 ? 20 : 0)
    expect(findColumnLayout([
      { inkByColumn: columns, startY: 0.6 },
      { inkByColumn: Array.from({ length: 100 }, () => 20), startY: 0.7 },
    ], 100)).toBeNull()
  })

  it('uses one gutter candidate only when OCR confirms questions were interleaved', () => {
    const columns = Array.from({ length: 100 }, (_, x) => x < 43 || x > 56 ? 20 : 0)
    expect(findColumnLayout([{ inkByColumn: columns, startY: 0.5 }], 100, 1))
      .toEqual({ split: 50, startY: 0.5 })
    expect(hasInterleavedQuestionStarts('H 131. (A) left choice 134. (A) right choice')).toBe(true)
    expect(hasInterleavedQuestionStarts('131. first question\n132. next question')).toBe(false)
  })
})

describe('trimColumnPreamble', () => {
  it('removes continued page instructions before the first numbered question', () => {
    expect(trimColumnPreamble('Select the best answer.\nThen mark the letter.\n105. Question text.'))
      .toBe('105. Question text.')
  })

  it('keeps text when the column has no recognizable question number', () => {
    expect(trimColumnPreamble('A passage without a numbered question')).toBe('A passage without a numbered question')
  })

  it('keeps a shared passage before interleaved questions without duplicating the questions', () => {
    const text = 'Questions 131-134 refer to this article.\nThe passage ends here.\nH 131. first question 134. second question'
    expect(trimQuestionBody(text)).toContain('The passage ends here.')
    expect(trimQuestionBody(text)).not.toContain('131.')
  })

  it('attaches shared article text to each mixed-layout question stem', () => {
    const passage = extractSharedPassage(
      'Questions 131-134 refer to the following article.\nMarch 12 — Parking is free.\nH 131. (A) being\n132. (A) economize',
    )
    expect(passage).toBe('March 12 — Parking is free.')
    expect(addSharedPassageToQuestions('H 131. (A) being\n132. (A) economize', passage))
      .toBe('H 131. March 12 — Parking is free.\n(A) being\n132. March 12 — Parking is free.\n(A) economize')
  })
})
