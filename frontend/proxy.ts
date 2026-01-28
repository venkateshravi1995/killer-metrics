import { neonAuthMiddleware } from "@neondatabase/auth/next/server"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

const authMiddleware = process.env.NEON_AUTH_BASE_URL
  ? neonAuthMiddleware({ loginUrl: "/auth/sign-in" })
  : null

export async function proxy(request: NextRequest) {
  if (!authMiddleware) {
    return NextResponse.next()
  }

  try {
    return await authMiddleware(request)
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "Neon auth middleware failed; allowing request in development.",
        error
      )
      return NextResponse.next()
    }
    throw error
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
