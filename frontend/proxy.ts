import { neonAuthMiddleware } from "@neondatabase/auth/next/server"

export const proxy = neonAuthMiddleware({ loginUrl: "/auth/sign-in" })

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
