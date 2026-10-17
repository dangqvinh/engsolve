export function findColumnSplit(inkByColumn: ArrayLike<number>, contentHeight: number): number | null {
  const width = inkByColumn.length
  if (width < 2 || contentHeight <= 0) return null

  const minGap = Math.max(12, Math.floor(width * 0.025))
  const maxInkInGutter = contentHeight * 0.006
  const candidates: { start: number; end: number }[] = []
  let start = -1

  for (let x = 0; x < width; x++) {
    if (inkByColumn[x] <= maxInkInGutter) {
      if (start < 0) start = x
    } else if (start >= 0) {
      if (x - start >= minGap) candidates.push({ start, end: x })
      start = -1
    }
  }
  if (start >= 0 && width - start >= minGap) candidates.push({ start, end: width })

  const center = width / 2
  const candidate = candidates
    .filter(({ start: left, end: right }) => {
      const split = (left + right) / 2
      return split >= width * 0.25 && split <= width * 0.75
    })
    .sort((a, b) => {
      const widthDifference = (b.end - b.start) - (a.end - a.start)
      if (widthDifference !== 0) return widthDifference
      return Math.abs((a.start + a.end) / 2 - center) - Math.abs((b.start + b.end) / 2 - center)
    })[0]

  if (!candidate) return null
  const split = Math.round((candidate.start + candidate.end) / 2)
  const leftInk = sum(inkByColumn, 0, split)
  const rightInk = sum(inkByColumn, split, width)
  const totalInk = leftInk + rightInk
  if (totalInk === 0 || Math.min(leftInk, rightInk) / totalInk < 0.08) return null
  return split
}

export function findColumnLayout(
  bands: Array<{ inkByColumn: ArrayLike<number>; startY: number }>,
  bandHeight: number,
  minBands = 2,
): { split: number; startY: number } | null {
  if (bands.length < minBands || bandHeight <= 0) return null
  const width = bands[0].inkByColumn.length
  if (width < 2 || bands.some((band) => band.inkByColumn.length !== width)) return null

  const candidates = bands.flatMap((band) => {
    const split = findColumnSplit(band.inkByColumn, bandHeight)
    return split === null ? [] : [{ split, startY: band.startY }]
  })
  const tolerance = width * 0.04
  const clusters = candidates
    .map((candidate) => candidates.filter((other) => Math.abs(other.split - candidate.split) <= tolerance))
    .filter((cluster) => cluster.length >= minBands)
    .sort((a, b) => b.length - a.length)
  const cluster = clusters[0]
  if (!cluster) return null

  const splits = cluster.map((candidate) => candidate.split).sort((a, b) => a - b)
  return {
    split: splits[Math.floor((splits.length - 1) * 0.25)],
    startY: Math.min(...cluster.map((candidate) => candidate.startY)),
  }
}

export function trimColumnPreamble(text: string): string {
  return splitAtFirstQuestion(text).questions || text
}

export function trimQuestionBody(text: string): string {
  return splitAtFirstQuestion(text).preamble
}

export function extractSharedPassage(text: string): string {
  const marker = /refer to the following\b[^\n]*\n?/i.exec(text)
  if (!marker) return ''
  return trimQuestionBody(text.slice(marker.index + marker[0].length)).trim()
}

export function addSharedPassageToQuestions(text: string, passage: string): string {
  if (!passage.trim()) return text
  return text.replace(
    /^([ \t]*[|:;Hh*]*[ \t]*(?:(?:question|q|câu)[ \t]*)?\d{1,3}[ \t]*[.):])[ \t]*/gim,
    (_match, questionStart: string) => `${questionStart} ${passage}\n`,
  )
}

export function hasInterleavedQuestionStarts(text: string): boolean {
  return text.split(/\r?\n/).some((line) => [...line.matchAll(/(?:^|\s)\d{1,3}\s*[.):]\s/g)].length >= 2)
}

function splitAtFirstQuestion(text: string): { preamble: string; questions: string } {
  const firstQuestion = text.search(/^[ \t]*[|:;Hh*]*[ \t]*(?:(?:question|q|câu)[ \t]*)?\d{1,3}[ \t]*[.):][ \t]*/im)
  return firstQuestion < 0
    ? { preamble: text, questions: '' }
    : { preamble: text.slice(0, firstQuestion), questions: text.slice(firstQuestion) }
}

function sum(values: ArrayLike<number>, start: number, end: number): number {
  let total = 0
  for (let i = start; i < end; i++) total += values[i]
  return total
}
