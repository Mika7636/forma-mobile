import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'

/**
 * A ref that is `true` while the component is mounted.
 *
 * For guarding state updates in async work that can outlive the component — an
 * awaited Firestore write, a delayed spinner reset. Updating state after unmount
 * is not fatal on its own, but it is the classic precursor to harder failures
 * (a navigation call against a torn-down screen), and it's noise that hides real
 * warnings in logcat.
 */
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

/**
 * `setTimeout` scoped to the component's lifetime: every pending timer is
 * cleared on unmount.
 *
 * The motivating case is a deferred navigation — "show the success toast, then
 * go back after 700 ms". If the user switches tabs inside that window, the bare
 * timer still fires and calls `navigation.navigate` plus a handful of setState
 * calls on a screen that no longer exists.
 *
 * Returns a `schedule` function with the same shape as `setTimeout`.
 */
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
