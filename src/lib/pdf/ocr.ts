import { pdfjs } from './extract'
import {
  addSharedPassageToQuestions,
  extractSharedPassage,
  findColumnLayout,
  hasInterleavedQuestionStarts,
  trimColumnPreamble,
  trimQuestionBody,
} from './ocrLayout'

export const OCR_MAX_PAGES = 25 // keeps browser memory and time reasonable

/** OCR for scanned PDFs using Tesseract.js (open source, runs in the browser, no paid API). */
export async function ocrPdf(file: File, onProgress?: (page: number, total: number) => void): Promise<{ text: string; truncated: boolean }> {
  const { createWorker } = await import('tesseract.js')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const total = Math.min(doc.numPages, OCR_MAX_PAGES)
  const worker = await createWorker('eng')
  const out: string[] = []
  const recognizeColumns = async (
    canvas: HTMLCanvasElement,
    split: number,
    cropStartRatio: number,
    prefixEndRatio: number,
    trimHeaders: boolean,
  ) => {
    const startY = Math.floor(canvas.height * cropStartRatio)
    const prefixEndY = Math.floor(canvas.height * prefixEndRatio)
    let sharedPassage = ''
    if (prefixEndY > 0) {
      const header = document.createElement('canvas')
      header.width = canvas.width
      header.height = prefixEndY
      const headerContext = header.getContext('2d')
      if (!headerContext) throw new Error('Could not prepare a PDF page section for OCR.')
      headerContext.drawImage(canvas, 0, 0, canvas.width, prefixEndY, 0, 0, canvas.width, prefixEndY)
      const { data } = await worker.recognize(header)
      sharedPassage = trimHeaders ? extractSharedPassage(data.text) : ''
      out.push(trimHeaders ? trimQuestionBody(data.text) : data.text)
      header.width = 0
      header.height = 0
    }
    for (const [left, width] of [[0, split], [split, canvas.width - split]]) {
      const column = document.createElement('canvas')
      column.width = width
      column.height = canvas.height - startY
      const columnContext = column.getContext('2d')
      if (!columnContext) throw new Error('Could not prepare a PDF text column for OCR.')
      columnContext.drawImage(canvas, left, startY, width, column.height, 0, 0, width, column.height)
      const { data } = await worker.recognize(column)
      const columnText = trimHeaders ? trimColumnPreamble(data.text) : data.text
      out.push(sharedPassage ? addSharedPassageToQuestions(columnText, sharedPassage) : columnText)
      column.width = 0
      column.height = 0
    }
  }
  try {
    for (let p = 1; p <= total; p++) {
      const page = await doc.getPage(p)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, viewport }).promise
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Could not prepare this PDF page for OCR.')
      const bandHeight = Math.floor(canvas.height * 0.2)
      const bandStep = 0.1
      const bands = []
      for (let startY = 0.1; startY <= 0.7; startY += bandStep) {
        const y = Math.floor(canvas.height * startY)
        const image = context.getImageData(0, y, canvas.width, bandHeight)
        const inkByColumn = new Uint32Array(canvas.width)
        for (let row = 0; row < image.height; row++) {
          for (let x = 0; x < image.width; x++) {
            const offset = (row * image.width + x) * 4
            if (image.data[offset] < 200 && image.data[offset + 1] < 200 && image.data[offset + 2] < 200) {
              inkByColumn[x]++
            }
          }
        }
        bands.push({ inkByColumn, startY })
      }

      let layout = findColumnLayout(bands, bandHeight)
      if (!layout) {
        const { data } = await worker.recognize(canvas)
        if (hasInterleavedQuestionStarts(data.text)) {
          layout = findColumnLayout(bands, bandHeight, 1)
        }
        if (layout) {
          await recognizeColumns(
            canvas,
            layout.split,
            Math.max(0, layout.startY - bandStep * 2),
            Math.min(0.9, layout.startY + bandStep),
            true,
          )
        } else {
          out.push(data.text)
        }
      } else {
        // Include the preceding band, where the first question may appear before the gutter stabilizes.
        const startRatio = Math.max(0, layout.startY - bandStep)
        await recognizeColumns(canvas, layout.split, startRatio, startRatio, startRatio > 0)
      }
      canvas.width = 0 // release memory
      canvas.height = 0
      onProgress?.(p, total)
    }
  } finally {
    await worker.terminate()
  }
  return { text: out.join('\n\n'), truncated: doc.numPages > total }
}
