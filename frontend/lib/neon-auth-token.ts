function isLikelyJwt(token: string | null | undefined) {
  return typeof token === "string" && token.split(".").length >= 3
}

export async function getNeonAuthToken() {
  if (typeof window === "undefined") {
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
  const { neonAuthClient } = await import("./auth")
  if (typeof neonAuthClient.token === "function") {
    const tokenResponse = await neonAuthClient.token()
    const token =
      (tokenResponse as { data?: { token?: string } }).data?.token ??
      (tokenResponse as { token?: string }).token
    if (token && isLikelyJwt(token)) {
      return token
    }
  }
  const neonAuthAny = neonAuthClient as { getJWTToken?: () => Promise<string | null> }
  if (typeof neonAuthAny.getJWTToken === "function") {
    const jwt = await neonAuthAny.getJWTToken()
    if (jwt && isLikelyJwt(jwt)) {
      return jwt
    }
  }
  const session = await neonAuthClient.getSession()
  const sessionToken = session.data?.session?.token
  return isLikelyJwt(sessionToken) ? sessionToken : null
}
