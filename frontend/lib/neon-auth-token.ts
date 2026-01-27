function isLikelyJwt(token: string | null | undefined) {
  return typeof token === "string" && token.split(".").length >= 3
}

export async function getNeonAuthToken() {
  if (typeof window !== "undefined") {
    console.info("[auth] getNeonAuthToken: client path")
  } else {
    console.info("[auth] getNeonAuthToken: server path")
  }
  if (typeof window === "undefined") {
    const { createAuthServer } = await import("@neondatabase/auth/next/server")
    const authServer = createAuthServer()
    if (typeof authServer.token === "function") {
      const tokenResponse = await authServer.token()
      console.info("[auth] server token response", tokenResponse)
      const token =
        (tokenResponse as { data?: { token?: string } }).data?.token ??
        (tokenResponse as { token?: string }).token
      console.info("[auth] server token", token?.slice(0, 24) ?? null)
      if (token && isLikelyJwt(token)) {
        return token
      }
    }
    if (typeof authServer.getJWTToken === "function") {
      const jwt = await authServer.getJWTToken()
      console.info("[auth] server getJWTToken", jwt?.slice(0, 24) ?? null)
      if (jwt && isLikelyJwt(jwt)) {
        return jwt
      }
    }
    const session = await authServer.getSession()
    console.info("[auth] server getSession token", session.data?.session?.token?.slice(0, 24) ?? null)
    const sessionToken = session.data?.session?.token
    return isLikelyJwt(sessionToken) ? sessionToken : null
  }
  const { neonAuthClient } = await import("./auth")
  if (typeof neonAuthClient.token === "function") {
    const tokenResponse = await neonAuthClient.token()
    console.info("[auth] client token response", tokenResponse)
    const token =
      (tokenResponse as { data?: { token?: string } }).data?.token ??
      (tokenResponse as { token?: string }).token
    console.info("[auth] client token", token?.slice(0, 24) ?? null)
    if (token && isLikelyJwt(token)) {
      return token
    }
  }
  if (typeof neonAuthClient.getJWTToken === "function") {
    const jwt = await neonAuthClient.getJWTToken()
    console.info("[auth] client getJWTToken", jwt?.slice(0, 24) ?? null)
    if (jwt && isLikelyJwt(jwt)) {
      return jwt
    }
  }
  const session = await neonAuthClient.getSession()
  console.info("[auth] client getSession token", session.data?.session?.token?.slice(0, 24) ?? null)
  const sessionToken = session.data?.session?.token
  return isLikelyJwt(sessionToken) ? sessionToken : null
}
