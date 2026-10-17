import { pdfjs } from './extract'

export const OCR_MAX_PAGES = 25 // keeps browser memory and time reasonable

/** OCR for scanned PDFs using Tesseract.js (open source, runs in the browser, no paid API). */
export async function ocrPdf(file: File, onProgress?: (page: number, total: number) => void): Promise<{ text: string; truncated: boolean }> {
  const { createWorker } = await import('tesseract.js')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const total = Math.min(doc.numPages, OCR_MAX_PAGES)
  const worker = await createWorker('eng')
  const out: string[] = []
  try {
    for (let p = 1; p <= total; p++) {
      const page = await doc.getPage(p)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, viewport }).promise
      const { data } = await worker.recognize(canvas)
      out.push(data.text)
      canvas.width = 0 // release memory
      onProgress?.(p, total)
    }
  } finally {
    await worker.terminate()
  }
  return { text: out.join('\n\n'), truncated: doc.numPages > total }
}
