// Email verification: send and refresh, with a resend cooldown.

import { reload, sendEmailVerification, type User as FirebaseUser } from 'firebase/auth'

export const RESEND_COOLDOWN_MS = 60_000

export type ResendOutcome =
  | { status: 'sent' }
  | { status: 'already-verified' }
  | { status: 'cooldown'; secondsRemaining: number }
  | { status: 'failed'; message: string }

const SEND_ERROR_MESSAGES: Record<string, string> = {
  'auth/too-many-requests': 'Try again in a few minutes.',
  'auth/network-request-failed': 'Check your connection and try again.',
}

const GENERIC_SEND_ERROR = 'Something went wrong. Please try again.'

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}

export function friendlySendError(error: unknown): string {
  const code = errorCode(error)
  return (code && SEND_ERROR_MESSAGES[code]) ?? GENERIC_SEND_ERROR
}

export async function refreshVerified(user: FirebaseUser): Promise<boolean> {
  try {
    await reload(user)
  } catch (error) {
    console.warn('[FORMA] could not refresh email verification state', error)
  }
  return user.emailVerified
}

export async function sendVerification(user: FirebaseUser): Promise<ResendOutcome> {
  if (await refreshVerified(user)) return { status: 'already-verified' }

  try {
    await sendEmailVerification(user)
    return { status: 'sent' }
  } catch (error) {
    return { status: 'failed', message: friendlySendError(error) }
  }
}

export function cooldownRemaining(sentAt: number | null, now: number = Date.now()): number {
  if (sentAt == null) return 0
  const remaining = RESEND_COOLDOWN_MS - (now - sentAt)
  if (remaining <= 0 || remaining > RESEND_COOLDOWN_MS) return 0
  return Math.ceil(remaining / 1000)
}
