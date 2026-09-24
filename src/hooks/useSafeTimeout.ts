// Mount-aware ref, and timeouts scoped to a component's lifetime.

import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'

export function useIsMounted(): MutableRefObject<boolean> {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}

export function useSafeTimeout() {
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout)
      timers.current.clear()
    },
    [],
  )

  return useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id)
      fn()
    }, ms)
    timers.current.add(id)
    return id
  }, [])
}
