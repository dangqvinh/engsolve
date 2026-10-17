// Gemini REST client. The API key is read from the GEMINI_API_KEY Edge Function secret only.
import { HttpError, requireEnv } from './http.ts'

export const DEFAULT_MODEL = 'gemini-2.5-flash'

export interface GeminiRequest {
  system: string
  user: string
  schema: unknown
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Calls Gemini once, with at most 2 retries for transient failures (5xx / network / timeout).
 * Quota (429) and configuration errors are NEVER retried and NEVER fall back to another model.
 */
export async function callGemini({ system, user, schema }: GeminiRequest): Promise<unknown> {
  const key = requireEnv('GEMINI_API_KEY')
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
  }

  let lastTransient = 'Gemini is temporarily unavailable.'
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1))
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45_000),
      })
    } catch {
      lastTransient = 'The request to Gemini timed out or failed.'
      continue
    }
    if (res.ok) {
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (typeof text !== 'string') throw new HttpError(502, 'Gemini returned an empty or blocked response.', 'ai_empty')
      try {
        return JSON.parse(text)
      } catch {
        throw new HttpError(502, 'Gemini returned malformed JSON. Nothing was saved; you can retry.', 'ai_invalid')
      }
    }
    if (res.status === 429) {
      throw new HttpError(429, 'The Gemini free-tier quota or rate limit was reached. Your questions are saved. Review them manually or retry later.', 'ai_quota')
    }
    if (res.status === 404) {
      throw new HttpError(400, `The configured Gemini model "${model}" is not available to your API project. Set GEMINI_MODEL to a model you can use.`, 'ai_model')
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new HttpError(400, 'Gemini rejected the request. Check that GEMINI_API_KEY is valid and the model name is correct.', 'ai_auth')
    }
    lastTransient = `Gemini returned status ${res.status}.`
  }
  throw new HttpError(503, `${lastTransient} Please retry in a few minutes.`, 'ai_unavailable')
}
