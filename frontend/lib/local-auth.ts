export type LocalAuthState = {
  loggedIn: boolean
  loggedInAt: string
  userId: string
  clientId: string
}

const STORAGE_KEY = "killer-metrics:auth"
const DEFAULT_USER_ID = "local-user"
const DEFAULT_CLIENT_ID = "local-client"

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

function safeParse(value: string | null) {
  if (!value) {
    return null
  }
  try {
    return JSON.parse(value) as LocalAuthState
  } catch {
    return null
  }
}

export function getLocalAuthState(): LocalAuthState | null {
  if (!isBrowser()) {
    return null
  }
  const stored = safeParse(window.localStorage.getItem(STORAGE_KEY))
  if (!stored || typeof stored.loggedIn !== "boolean") {
    return null
  }
  return {
    loggedIn: stored.loggedIn,
    loggedInAt: stored.loggedInAt || new Date(0).toISOString(),
    userId: stored.userId || DEFAULT_USER_ID,
    clientId: stored.clientId || DEFAULT_CLIENT_ID,
  }
}

export function isLocallyAuthenticated() {
  return Boolean(getLocalAuthState()?.loggedIn)
}

export function logInLocalAuth(
  overrides?: Partial<Pick<LocalAuthState, "userId" | "clientId">>
) {
  if (!isBrowser()) {
    return
  }
  const next: LocalAuthState = {
    loggedIn: true,
    loggedInAt: new Date().toISOString(),
    userId: overrides?.userId || DEFAULT_USER_ID,
    clientId: overrides?.clientId || DEFAULT_CLIENT_ID,
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function logOutLocalAuth() {
  if (!isBrowser()) {
    return
  }
  const next: LocalAuthState = {
    loggedIn: false,
    loggedInAt: new Date().toISOString(),
    userId: DEFAULT_USER_ID,
    clientId: DEFAULT_CLIENT_ID,
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function getLocalAuthDefaults() {
  return { userId: DEFAULT_USER_ID, clientId: DEFAULT_CLIENT_ID }
}
