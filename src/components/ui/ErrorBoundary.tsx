import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { COLORS, RADIUS, SPACING, TYPE, WEIGHT } from '../../constants/theme'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Shown as the heading, e.g. "Live tracking hit a problem". */
  title?: string
  /** Shown under the heading. Keep it about what the user can do next. */
  message?: string
  /** Label for the recovery button. */
  retryLabel?: string
  /**
   * Extra escape hatch rendered under the retry button — e.g. the live tracker
   * offers "Save what we tracked" so a map crash never costs the user their run.
   */
  secondaryLabel?: string
  onSecondary?: () => void
  /** Called after the boundary resets, so the parent can re-seed state. */
  onReset?: () => void
  /** Tag used in the console log, so crashes are attributable in logcat. */
  name?: string
  /** Dark surfaces (the live tracker) need light text. */
  theme?: 'light' | 'dark'
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches render/lifecycle errors in a subtree and shows a recoverable screen
 * instead of letting the error reach the root.
 *
 * Why this matters on a real device: in a **release** build there is no redbox.
 * An uncaught React error unmounts the entire tree, so the user sees the app
 * blank out or die — indistinguishable from a native crash. A boundary turns
 * that into a contained, retryable message.
 *
 * Caveat worth knowing (it's why the LiveTracker fixes are defensive rather than
 * relying on this): a boundary only catches errors thrown *during React
 * rendering, lifecycle and constructors*. It does **not** catch errors inside
 * async callbacks (a GPS listener firing outside React's call stack), and it
 * cannot catch a crash inside a native module. Those must be prevented at the
 * source — see `utils/geo.ts` coordinate validation.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep this — on-device this is the only trace of what happened, and it is
    // what `adb logcat` will show when diagnosing a user-reported crash.
    console.error(`[ErrorBoundary${this.props.name ? `: ${this.props.name}` : ''}]`, error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const {
      title = 'Something went wrong',
      message = 'This screen ran into an unexpected problem. Your saved data is safe.',
      retryLabel = 'Try again',
      secondaryLabel,
      onSecondary,
      theme = 'light',
    } = this.props

    const dark = theme === 'dark'
    const bg = dark ? COLORS.ink : COLORS.pageBg
    const cardBg = dark ? '#1f2937' : COLORS.white
    const titleColor = dark ? COLORS.white : COLORS.ink
    const bodyColor = dark ? COLORS.subtle : COLORS.muted

    return (
      <View style={{ flex: 1, backgroundColor: bg, justifyContent: 'center', padding: SPACING.lg }}>
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: RADIUS.card,
            padding: SPACING.lg,
            borderWidth: 1,
            borderColor: dark ? '#374151' : COLORS.border,
          }}
        >
          <Text style={{ fontSize: 32, textAlign: 'center' }}>⚠️</Text>
          <Text
            style={{
              marginTop: SPACING.md,
              fontSize: TYPE.title,
              fontWeight: WEIGHT.heavy,
              color: titleColor,
              textAlign: 'center',
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              marginTop: SPACING.sm,
              fontSize: TYPE.body,
              color: bodyColor,
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            {message}
          </Text>

          {/* The message itself, in small print. Genuinely useful when a user
              screenshots this for a bug report. */}
          <ScrollView style={{ maxHeight: 90, marginTop: SPACING.md }}>
            <Text
              style={{
                fontSize: TYPE.caption,
                color: dark ? COLORS.muted : COLORS.subtle,
                textAlign: 'center',
              }}
            >
              {error.message || String(error)}
            </Text>
          </ScrollView>

          <Pressable
            onPress={this.handleReset}
            style={{
              marginTop: SPACING.lg,
              height: 50,
              borderRadius: RADIUS.md,
              backgroundColor: COLORS.teal,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: COLORS.white, fontSize: TYPE.subtitle, fontWeight: WEIGHT.heavy }}>
              {retryLabel}
            </Text>
          </Pressable>

          {secondaryLabel && onSecondary ? (
            <Pressable
              onPress={onSecondary}
              style={{
                marginTop: SPACING.sm,
                height: 46,
                borderRadius: RADIUS.md,
                borderWidth: 1.5,
                borderColor: COLORS.teal,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: COLORS.teal, fontSize: TYPE.body, fontWeight: WEIGHT.bold }}>
                {secondaryLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    )
  }
}
