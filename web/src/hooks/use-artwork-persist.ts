import { useCallback, useEffect, useRef } from 'react'
import { api } from '@/lib/api'

const FLUSH_DELAY_MS = 1500
const MAX_BATCH = 50

/**
 * Collects ids whose provisional (pattern-derived) artwork actually loaded
 * and persists them in small debounced batches — one tiny POST instead of a
 * call per card.
 */
export function useArtworkPersist(): (id: number) => void {
  const queue = useRef<Set<number>>(new Set())
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flush = useCallback((): void => {
    timer.current = undefined
    const ids = [...queue.current]
    queue.current = new Set()
    if (ids.length > 0) api.persistImageUrls(ids).catch(() => {})
  }, [])

  // Best-effort flush if the page unmounts with queued ids.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (queue.current.size > 0) api.persistImageUrls([...queue.current]).catch(() => {})
    },
    [],
  )

  return useCallback(
    (id: number) => {
      queue.current.add(id)
      if (queue.current.size >= MAX_BATCH) {
        if (timer.current) clearTimeout(timer.current)
        flush()
      } else if (!timer.current) {
        timer.current = setTimeout(flush, FLUSH_DELAY_MS)
      }
    },
    [flush],
  )
}
