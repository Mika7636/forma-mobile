// Wraps a screen in its own error boundary.

import type { ComponentType } from 'react'
import ErrorBoundary from './ErrorBoundary'

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
