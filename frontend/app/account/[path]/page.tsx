"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  getLocalAuthDefaults,
  getLocalAuthState,
  logInLocalAuth,
  logOutLocalAuth,
} from "@/lib/local-auth"

export default function AccountPage() {
  const params = useParams<{ path?: string | string[] }>()
  const router = useRouter()
  const paramValue = params?.path
  const accountPath =
    typeof paramValue === "string"
      ? paramValue
      : Array.isArray(paramValue)
        ? paramValue[0]
        : "settings"
  const [authState, setAuthState] = useState(() => getLocalAuthState())

  useEffect(() => {
    setAuthState(getLocalAuthState())
  }, [])

  const defaults = getLocalAuthDefaults()
  const isLoggedIn = Boolean(authState?.loggedIn)
  const userId = authState?.userId || defaults.userId
  const clientId = authState?.clientId || defaults.clientId
  const loggedInAt = authState?.loggedInAt
    ? new Date(authState.loggedInAt).toLocaleString()
    : "Not signed in"

  return (
    <div className="app-shell min-h-screen px-4 py-10">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <Link className="text-sm font-medium text-slate-600 hover:text-slate-900" href="/">
          ← Back to dashboard
        </Link>
        <span className="text-xs uppercase tracking-[0.28em] text-slate-400">
          Account center
        </span>
      </div>
      <div className="mx-auto mt-8 grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_2fr]">
        <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-6 shadow-sm backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Profile + Security
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">
            Keep your workspace locked and personalized.
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            Update your account details, change passwords, and review sign-in activity
            without leaving the dashboard flow.
          </p>
          <div className="mt-6 rounded-xl border border-slate-200/70 bg-slate-50/70 p-4 text-xs text-slate-500">
            Tip: Use a long, unique password and rotate it periodically to keep your
            access secure.
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                {accountPath}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                Local account snapshot
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                This demo stores session state locally without external auth.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 rounded-xl border border-slate-200/70 bg-white/60 p-4 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <span>User ID</span>
              <span className="font-medium text-slate-900">{userId}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Client ID</span>
              <span className="font-medium text-slate-900">{clientId}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Status</span>
              <span className="font-medium text-slate-900">
                {isLoggedIn ? "Signed in locally" : "Signed out"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Last updated</span>
              <span className="font-medium text-slate-900">{loggedInAt}</span>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            {isLoggedIn ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    logOutLocalAuth()
                    setAuthState(getLocalAuthState())
                  }}
                >
                  Log out locally
                </Button>
                <Button onClick={() => router.replace("/")}>Return to dashboard</Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => {
                    logInLocalAuth()
                    setAuthState(getLocalAuthState())
                  }}
                >
                  Sign in locally
                </Button>
                <Button variant="outline" onClick={() => router.replace("/auth/sign-in")}>
                  Go to login screen
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
