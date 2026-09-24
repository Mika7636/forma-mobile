// Shared state behind the email-verification surfaces.

import { useCallback, useEffect, useState } from 'react'
import { cooldownRemaining } from '../services/emailVerification'
import { useAuthStore, useIsDemo } from '../store/authStore'
import { toast } from '../store/toastStore'

export interface EmailVerificationState {
  verified: boolean
  showBanner: boolean
  sending: boolean
  cooldown: number
  resend: () => Promise<void>
  dismiss: () => void
}

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
    showBanner: signedIn && !verified && !dismissed && !isDemo,
    sending,
    cooldown,
    resend,
    dismiss: dismissBanner,
  }
}
