import { useCallback, useEffect, useState } from 'react'
import { readableError } from './utils'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
  setData: (value: T) => void
}

/** Small data hook: runs the loader, tracks loading/error, and can refetch. */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // The loader identity changes on every render by design; deps drive refetching.
  const run = useCallback(loader, deps) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    run()
      .then((result) => { if (active) setData(result) })
      .catch((err) => { if (active) setError(readableError(err)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [run, tick])

  return {
    data, loading, error,
    reload: () => setTick((t) => t + 1),
    setData: (value: T) => setData(value),
  }
}
