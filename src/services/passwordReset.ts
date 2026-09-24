// Password reset: the one Auth call, with a resend cooldown.

import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../config/firebase'
import { isDemoEmail } from '../config/demo'

export const RESET_COOLDOWN_MS = 60_000

export type ResetOutcome =
  | { status: 'sent' }
  | { status: 'cooldown'; secondsRemaining: number }
  | { status: 'failed'; message: string }

const RESET_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/too-many-requests': 'Try again in a few minutes.',
  'auth/network-request-failed': 'Check your connection and try again.',
}

const GENERIC_RESET_ERROR = 'Something went wrong. Please try again.'

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}

export async function sendPasswordReset(email: string): Promise<ResetOutcome> {
  if (isDemoEmail(email)) return { status: 'sent' }

  try {
    await sendPasswordResetEmail(auth, email.trim())
    return { status: 'sent' }
  } catch (error) {
    const code = errorCode(error)
    if (code === 'auth/user-not-found') return { status: 'sent' }
    return {
      status: 'failed',
      message: (code && RESET_ERROR_MESSAGES[code]) ?? GENERIC_RESET_ERROR,
    }
  }
}

export function resetCooldownRemaining(sentAt: number | null, now: number = Date.now()): number {
  if (sentAt == null) return 0
  const remaining = RESET_COOLDOWN_MS - (now - sentAt)
  if (remaining <= 0 || remaining > RESET_COOLDOWN_MS) return 0
  return Math.ceil(remaining / 1000)
}
