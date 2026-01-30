function isLikelyJwt(token: string | null | undefined) {
  return typeof token === "string" && token.split(".").length >= 3
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=")
  try {
    if (typeof atob === "function") {
      return atob(padded)
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.from(padded, "base64").toString("utf-8")
    }
  } catch {
    return null
  }
  return null
}

function getTokenExpiryMs(token: string) {
  const parts = token.split(".")
  if (parts.length < 2) {
    return null
  }
  const payload = decodeBase64Url(parts[1])
  if (!payload) {
    return null
  }
  try {
    const data = JSON.parse(payload) as { exp?: number }
    if (typeof data.exp === "number") {
      return data.exp * 1000
    }
  } catch {
    return null
  }
  return null
}

const CLIENT_TOKEN_SKEW_MS = 30_000
const CLIENT_FALLBACK_TTL_MS = 60_000

let cachedClientToken: { token: string; expMs: number } | null = null
let inflightClientToken: Promise<string | null> | null = null

function getCachedClientToken() {
  if (!cachedClientToken) {
    return null
  }
  const now = Date.now()
  if (cachedClientToken.expMs - CLIENT_TOKEN_SKEW_MS <= now) {
    cachedClientToken = null
    return null
  }
  return cachedClientToken.token
}

function updateClientCache(token: string) {
  const expMs = getTokenExpiryMs(token) ?? Date.now() + CLIENT_FALLBACK_TTL_MS
  cachedClientToken = { token, expMs }
}

async function resolveServerToken() {
  const { createAuthServer } = await import("@neondatabase/auth/next/server")
  const authServer = createAuthServer()
  if (typeof authServer.token === "function") {
    const tokenResponse = await authServer.token()
    const token =
      (tokenResponse as { data?: { token?: string } }).data?.token ??
      (tokenResponse as { token?: string }).token
    if (token && isLikelyJwt(token)) {
      return token
    }
  }
  const authServerAny = authServer as { getJWTToken?: () => Promise<string | null> }
  if (typeof authServerAny.getJWTToken === "function") {
    const jwt = await authServerAny.getJWTToken()
    if (jwt && isLikelyJwt(jwt)) {
      return jwt
    }
  }
  const session = await authServer.getSession()
  const sessionToken = session.data?.session?.token
  return isLikelyJwt(sessionToken) ? sessionToken : null
}

async function resolveClientToken(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = getCachedClientToken()
    if (cached) {
      return cached
    }
  }
  if (inflightClientToken) {
    return inflightClientToken
  }
  inflightClientToken = (async () => {
    const { neonAuthClient } = await import("./auth")
    if (typeof neonAuthClient.token === "function") {
      const tokenResponse = await neonAuthClient.token()
      const token =
        (tokenResponse as { data?: { token?: string } }).data?.token ??
        (tokenResponse as { token?: string }).token
      if (token && isLikelyJwt(token)) {
        updateClientCache(token)
        return token
      }
    }
    const neonAuthAny = neonAuthClient as { getJWTToken?: () => Promise<string | null> }
    if (typeof neonAuthAny.getJWTToken === "function") {
      const jwt = await neonAuthAny.getJWTToken()
      if (jwt && isLikelyJwt(jwt)) {
        updateClientCache(jwt)
        return jwt
      }
    }
    const session = await neonAuthClient.getSession()
    const sessionToken = session.data?.session?.token
    if (isLikelyJwt(sessionToken)) {
      updateClientCache(sessionToken)
      return sessionToken
    }
    return null
  })()
  try {
    return await inflightClientToken
  } finally {
    inflightClientToken = null
  }
}

export async function getNeonAuthToken(options?: { forceRefresh?: boolean }) {
  if (typeof window === "undefined") {
    return resolveServerToken()
  }
  const token = await resolveClientToken(Boolean(options?.forceRefresh))
  if (!token && !options?.forceRefresh) {
    return resolveClientToken(true)
  }
  return token
}
