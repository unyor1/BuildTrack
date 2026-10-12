// Remembers WHY the person pressed "Continue with Google": to log in or to register. Google sends them back to /login either way, so the app
// reads this note on return. A login attempt by a Google account that never registered is cut off (Edge Function `oauth-gate`).
// The note only steers the screens: the database never gives such an account access (it stays pending until an administrator decides).
const INTENT_KEY = "buildtrack.oauthIntent"
const NOTICE_KEY = "buildtrack.loginNotice"
const MAX_AGE_MS = 15 * 60_000

export type OAuthIntent = "login" | "register"

export function setOAuthIntent(intent: OAuthIntent) {
  try {
    sessionStorage.setItem(INTENT_KEY, JSON.stringify({ intent, at: Date.now() }))
  } catch {
    // Without storage the person lands on the registration form (safe: no access is given either way).
  }
}

export function readOAuthIntent(now = Date.now()): OAuthIntent | null {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as { intent?: string; at?: number }
    if ((saved.intent === "login" || saved.intent === "register") && typeof saved.at === "number" && now - saved.at <= MAX_AGE_MS) return saved.intent
  } catch {
    // Treated as no note.
  }
  return null
}

export function clearOAuthIntent() {
  try {
    sessionStorage.removeItem(INTENT_KEY)
  } catch {
    // Nothing to clear.
  }
}

export const NO_ACCOUNT_MESSAGE = "No BuildTrack account found for this Google email. Please register first or contact your administrator."
export const GATE_FAILED_MESSAGE = "We could not check your account just now. Please try again, or register first if you have not yet."

// A message to show on the login screen after the page was reloaded (the sign-out reloads it).
export function setLoginNotice(message: string) {
  try {
    sessionStorage.setItem(NOTICE_KEY, message)
  } catch {
    // The person simply sees the login screen without the message.
  }
}

export function takeLoginNotice(): string {
  try {
    const message = sessionStorage.getItem(NOTICE_KEY) ?? ""
    sessionStorage.removeItem(NOTICE_KEY)
    return message
  } catch {
    return ""
  }
}
