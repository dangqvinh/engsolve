import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '../../lib/errors'

/** Minimal loader hook: runs `fn` on mount/dependency change and exposes loading + error + reload. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)
  const load = useCallback(() => {
    setLoading(true); setError(null)
    return run().then(setData).catch((e) => setError(errorMessage(e))).finally(() => setLoading(false))
  }, [run])
  useEffect(() => { void load() }, [load])
  return { data, error, loading, reload: load, setData }
}
