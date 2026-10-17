export const MAX_PDF_BYTES = 10 * 1024 * 1024 // matches the Supabase bucket limit set in the migration

/** Cheap client-side checks. The bucket also enforces MIME type and size server-side. */
export async function validatePdf(file: File): Promise<string | null> {
  if (!file.name.toLowerCase().endsWith('.pdf')) return 'The file must have a .pdf extension.'
  if (file.type && file.type !== 'application/pdf') return 'The file type must be application/pdf.'
  if (file.size === 0) return 'The file is empty.'
  if (file.size > MAX_PDF_BYTES) return `The file is larger than ${MAX_PDF_BYTES / 1024 / 1024} MB.`
  const head = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer())
  if (head !== '%PDF-') return 'This does not look like a real PDF file.'
  return null
}

export async function sha256(file: File): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
