"use client"

import { useCallback, useEffect, useState } from "react"

import { neonAuthClient } from "@/lib/auth"

type SignOutStatus = "pending" | "error"

export default function SignOutPage() {
  const [status, setStatus] = useState<SignOutStatus>("pending")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const attemptSignOut = useCallback(async () => {
    setStatus("pending")
    setErrorMessage(null)
    try {
      const response = await neonAuthClient.signOut({
        fetchOptions: { credentials: "include" },
      })
      if (response?.error) {
        throw new Error(response.error.message || "Sign-out failed.")
      }
      if (response?.data && response.data.success !== true) {
        throw new Error("Sign-out failed.")
      }
      window.location.replace("/auth/sign-in")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Sign-out failed."
      setErrorMessage(message)
      setStatus("error")
    }
  }, [])

  useEffect(() => {
    void attemptSignOut()
  }, [attemptSignOut])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/85 p-8 text-center shadow-lg">
        <h1 className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Signing out
        </h1>
        {status === "pending" ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Ending your session...
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-destructive">{errorMessage}</p>
            <button
              type="button"
              onClick={attemptSignOut}
              className="mt-6 rounded-full border border-border/60 bg-background px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-foreground transition hover:bg-accent/60"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  )
}
