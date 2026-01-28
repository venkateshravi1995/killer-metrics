"use client"

import { AccountView } from "@neondatabase/auth/react"
import Link from "next/link"
import { useParams } from "next/navigation"

import { NeonAuthProvider } from "@/components/auth/neon-auth-provider"

export default function AccountPage() {
  const params = useParams<{ path?: string | string[] }>()
  const paramValue = params?.path
  const accountPath =
    typeof paramValue === "string"
      ? paramValue
      : Array.isArray(paramValue)
        ? paramValue[0]
        : "settings"

  return (
    <NeonAuthProvider>
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
              Update your account details, change passwords, and review sign-in
              activity without leaving the dashboard flow.
            </p>
            <div className="mt-6 rounded-xl border border-slate-200/70 bg-slate-50/70 p-4 text-xs text-slate-500">
              Tip: Use a long, unique password and rotate it periodically to keep your
              access secure.
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur">
            <AccountView path={accountPath} />
          </div>
        </div>
      </div>
    </NeonAuthProvider>
  )
}
