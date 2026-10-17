import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface ExtractResult {
  text: string
  pageCount: number
  charsPerPage: number
  /** true when the PDF has too little embedded text and probably needs OCR */
  looksScanned: boolean
}

const MIN_CHARS_PER_PAGE = 40

/** Extracts the embedded text layer, page by page, in the browser. */
export async function extractPdfText(file: File, onProgress?: (page: number, total: number) => void): Promise<ExtractResult> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    // Rebuild lines using the vertical position of each text run.
    let line = ''
    let lastY: number | null = null
    const lines: string[] = []
    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = item.transform[5] as number
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line)
        line = ''
      }
      line += item.str + (item.hasEOL ? '\n' : '')
      lastY = y
    }
    lines.push(line)
    pages.push(lines.join('\n'))
    onProgress?.(p, doc.numPages)
  }
  const text = pages.join('\n\n')
  const charsPerPage = text.replace(/\s/g, '').length / Math.max(1, doc.numPages)
  return { text, pageCount: doc.numPages, charsPerPage, looksScanned: charsPerPage < MIN_CHARS_PER_PAGE }
}

export { pdfjs }
