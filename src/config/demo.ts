// Demo mode: how the app detects it, and what it forbids.

import Constants from 'expo-constants'

interface DemoAccount {
  email: string
  password: string
}

const configured = Constants.expoConfig?.extra?.demoAccount as DemoAccount | undefined

export const DEMO_AVAILABLE: boolean =
  typeof configured?.email === 'string' &&
  configured.email.length > 0 &&
  typeof configured?.password === 'string' &&
  configured.password.length > 0

export const DEMO_EMAIL: string | null = DEMO_AVAILABLE ? configured!.email : null
export const DEMO_PASSWORD: string | null = DEMO_AVAILABLE ? configured!.password : null

export function isDemoEmail(email: string | null | undefined): boolean {
  if (!DEMO_EMAIL || !email) return false
  return email.trim().toLowerCase() === DEMO_EMAIL.trim().toLowerCase()
}

export const DEMO_BLOCKED_TITLE = 'Not available in demo mode'
export const DEMO_BLOCKED_DESCRIPTION =
  'This demo account has twelve weeks of training behind it, and changing these settings would change what every screen shows. Logging and editing sessions still works.'
