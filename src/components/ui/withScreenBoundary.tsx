import type { ComponentType } from 'react'
import ErrorBoundary from './ErrorBoundary'

/**
 * Wrap a screen in its own error boundary.
 *
 * Applied per tab rather than once around the navigator on purpose: the failure
 * is then contained to the screen that caused it. The tab bar keeps working,
 * every other tab keeps its state, and "Try again" remounts only the broken
 * screen. A single boundary at the root would instead replace the whole app
 * with an error card and lose the user's place.
 *
 * Call this at module scope — building the wrapper inside a render would create
 * a new component type each time and remount the screen on every render.
 */
export function withScreenBoundary<P extends object>(
  Screen: ComponentType<P>,
  label: string,
): ComponentType<P> {
  function ScreenWithBoundary(props: P) {
    return (
      <ErrorBoundary
        name={label}
        title={`${label} couldn't load`}
        message="This screen ran into an unexpected problem. Your training data is safe — try again, or switch to another tab."
        retryLabel="Try again"
      >
        <Screen {...props} />
      </ErrorBoundary>
    )
  }
  ScreenWithBoundary.displayName = `withScreenBoundary(${label})`
  return ScreenWithBoundary
}
