export async function getNeonAuthToken() {
  if (typeof window === "undefined") {
    const { createAuthServer } = await import(
      "@neondatabase/neon-js/auth/next/server"
    )
    const authServer = createAuthServer()
    const session = await authServer.getSession()
    return session.data?.session?.token ?? null
  }
  const { neonAuthClient } = await import("./auth")
  const session = await neonAuthClient.getSession()
  return session.data?.session?.token ?? null
}
