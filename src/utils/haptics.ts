// One place to decide what every kind of interaction feels like.
//
// Why this exists rather than calling expo-haptics directly at each site:
//   1. Consistency. "Saving something" should feel identical on the Log screen,
//      the session editor and Settings. Naming the *intent* (`haptics.success`)
//      instead of the *waveform* (`notificationAsync(Success)`) is what keeps
//      that true as screens get added.
//   2. Safety. Every expo-haptics call returns a promise that rejects on
//      hardware/OS combinations without a vibrator (and on web). Un-awaited,
//      those become unhandled rejections that show up as a red box in dev. All
//      of these swallow the rejection — feedback is a nicety, never a failure.
//
// House style, applied across the app:
//   light     tab switches, selections, toggles, slider steps, opening a sheet
//   medium    primary buttons (Save / Log / Start), pull-to-refresh
//   heavy     a destructive action actually committing
//   success   a write landed (session saved, settings saved, onboarding done)
//   warning   a conflict was detected, a delete confirmation is being asked for
//   error     an action failed
//
// Deliberately NOT hapticised: scrolling, text input, every card tap in a list.
import * as Haptics from 'expo-haptics'

/** Fire-and-forget: never let missing haptics hardware surface as an error. */
function fire(run: () => Promise<void>): void {
  run().catch(() => {})
}

export const haptics = {
  /** Selections, toggles, tab switches, slider steps — the lightest tick. */
  light: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Primary buttons and committed gestures. */
  medium: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Reserved for destructive commits — heavier than any everyday tap. */
  heavy: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** Moving through a set of options (segmented controls, pickers). */
  selection: () => fire(() => Haptics.selectionAsync()),
  /** A write succeeded. */
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** A conflict was raised, or we're about to ask "are you sure?". */
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** An action failed. */
  error: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
} as const
