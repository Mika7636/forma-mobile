// Maps Firebase Auth error codes to short, human-readable messages we can show
// directly under the inputs. Firebase throws a `FirebaseError` whose `.code`
// looks like "auth/wrong-password"; we key off that. Anything unrecognised
// falls back to a generic message so we never surface a raw code to the user.

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/wrong-password': 'Wrong password. Please try again.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-login-credentials': 'Incorrect email or password.',
  'auth/email-already-in-use': 'An account with that email already exists.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/missing-password': 'Please enter your password.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Check your connection.',
}

/** Extracts a Firebase Auth error `code` if the thrown value carries one. */
function getAuthErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}

export function friendlyAuthError(error: unknown): string {
  const code = getAuthErrorCode(error)
  if (code && code in AUTH_ERROR_MESSAGES) {
    return AUTH_ERROR_MESSAGES[code]
  }
  return 'Something went wrong. Please try again.'
}
