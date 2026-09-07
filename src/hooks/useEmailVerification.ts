// The verification banner's brain, shared by the two surfaces that show it.
//
// The Dashboard banner and the Settings row are the same state seen twice — the
// same flag, the same cooldown, the same button — so they must not each keep
// their own copy of it. Tapping "Resend" on the Dashboard and then walking into
// Settings has to show a countdown already running, not a fresh button offering
// to send a second email that Firebase would refuse.
//
// The state lives in the auth store (verified flag, dismissal, last-sent
// timestamp); this hook adds the two things a store cannot have: a ticking
// second-by-second countdown, and the decision about whether the banner belongs
// on screen at all.
import { useCallback, useEffect, useState } from 'react'
import { cooldownRemaining } from '../services/emailVerification'
import { useAuthStore, useIsDemo } from '../store/authStore'
import { toast } from '../store/toastStore'

export interface EmailVerificationState {
  /** True once Firebase has confirmed the address. */
  verified: boolean
  /** Whether the Dashboard should render the banner right now. */
  showBanner: boolean
  /** True while a send is in flight — the button shows a spinner. */
  sending: boolean
  /** Seconds until another send is allowed; 0 when the button is live. */
  cooldown: number
  /** Send (or re-send) the email. Handles its own toasts; never throws. */
  resend: () => Promise<void>
  /** Hide the Dashboard banner for the rest of this session. */
  dismiss: () => void
}

/**
 * Recompute the countdown once a second, from the wall clock rather than by
 * decrementing.
 *
 * Decrementing a counter would drift, and worse, would be wrong after a
 * backgrounded app comes back: JS timers are throttled or suspended outright
 * while FORMA is not in the foreground, so a counter ticked by hand would resume
 * from wherever it was frozen and hold the button hostage long after the minute
 * had passed. Deriving from `sentAt` means a resume recomputes the truth.
 *
 * The interval only exists while there is something to count, so a verified —
 * or simply idle — app is not running a timer for the life of the session.
 */
function useCooldownTick(sentAt: number | null): number {
  const [seconds, setSeconds] = useState(() => cooldownRemaining(sentAt))

  useEffect(() => {
    const now = cooldownRemaining(sentAt)
    setSeconds(now)
    if (now <= 0) return

    const id = setInterval(() => {
      const next = cooldownRemaining(sentAt)
      setSeconds(next)
      if (next <= 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [sentAt])

  return seconds
}

export function useEmailVerification(): EmailVerificationState {
  const isDemo = useIsDemo()
  const signedIn = useAuthStore((s) => s.user != null)
  const verified = useAuthStore((s) => s.emailVerified)
  const dismissed = useAuthStore((s) => s.verificationDismissed)
  const sending = useAuthStore((s) => s.verificationSending)
  const sentAt = useAuthStore((s) => s.verificationSentAt)
  const dismissBanner = useAuthStore((s) => s.dismissVerificationBanner)
  const resendEmail = useAuthStore((s) => s.resendVerificationEmail)

  const cooldown = useCooldownTick(sentAt)

  const resend = useCallback(async () => {
    const outcome = await resendEmail()
    switch (outcome.status) {
      case 'sent':
        toast.success('Verification email sent', {
          description: 'Check your inbox — and your spam folder.',
        })
        return
      case 'already-verified':
        // The banner has just disappeared underneath the button that was
        // tapped. Without this the disappearance reads as the tap having
        // silently failed, rather than as the good news it is.
        toast.success('Your email is already verified')
        return
      case 'cooldown':
        toast.info(`Hold on ${outcome.secondsRemaining}s`, {
          description: 'You can request another link in a moment.',
        })
        return
      case 'failed':
        toast.error("Couldn't send the email", { description: outcome.message })
    }
  }, [resendEmail])

  return {
    verified,
    // Demo mode is excluded outright rather than dismissed-by-default: the demo
    // account's inbox is not the tester's, its verification state means nothing
    // to anybody, and the demo strip is already sitting across the top of every
    // screen. A second band under it advertising a chore that isn't theirs is
    // the one thing on this screen that would look like a fault.
    showBanner: signedIn && !verified && !dismissed && !isDemo,
    sending,
    cooldown,
    resend,
    dismiss: dismissBanner,
  }
}
