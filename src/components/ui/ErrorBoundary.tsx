// Catches errors in a subtree and shows a recoverable screen.

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'
interface ErrorBoundaryProps {
  children: ReactNode
  title?: string
  message?: string
  retryLabel?: string
  secondaryLabel?: string
  onSecondary?: () => void
  onReset?: () => void
  name?: string
}

interface ErrorBoundaryState {
  error: Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `: ${this.props.name}` : ''}]`, error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <ErrorFallback
        error={error}
        title={this.props.title}
        message={this.props.message}
        retryLabel={this.props.retryLabel}
        secondaryLabel={this.props.secondaryLabel}
        onSecondary={this.props.onSecondary}
        onRetry={this.handleReset}
      />
    )
  }
}

function ErrorFallback({
  error,
  title = 'Something went wrong',
  message = 'This screen ran into an unexpected problem. Your saved data is safe.',
  retryLabel = 'Try again',
  secondaryLabel,
  onSecondary,
  onRetry,
}: {
  error: Error
  title?: string
  message?: string
  retryLabel?: string
  secondaryLabel?: string
  onSecondary?: () => void
  onRetry: () => void
}) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        justifyContent: 'center',
        padding: SPACING.lg,
      }}
    >
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: RADIUS.card,
          padding: SPACING.lg,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ fontSize: 32, textAlign: 'center' }}>⚠️</Text>
        <Text
          style={{
            marginTop: SPACING.md,
            fontSize: TYPE.title,
            fontWeight: WEIGHT.heavy,
            color: colors.text,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            marginTop: SPACING.sm,
            fontSize: TYPE.body,
            color: colors.textMuted,
            textAlign: 'center',
            lineHeight: 20,
          }}
        >
          {message}
        </Text>

        <ScrollView style={{ maxHeight: 90, marginTop: SPACING.md }}>
          <Text
            style={{
              fontSize: TYPE.caption,
              color: colors.textSubtle,
              textAlign: 'center',
            }}
          >
            {error.message || String(error)}
          </Text>
        </ScrollView>

        <Pressable
          onPress={onRetry}
          style={{
            marginTop: SPACING.lg,
            height: 50,
            borderRadius: RADIUS.md,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.onAccent, fontSize: TYPE.subtitle, fontWeight: WEIGHT.heavy }}>
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
              borderColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.accentText, fontSize: TYPE.body, fontWeight: WEIGHT.bold }}>
              {secondaryLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}
