"use client"

import { AccountView } from "@neondatabase/neon-js/auth/react/ui"
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
      <div className="app-shell flex min-h-screen items-center justify-center px-4 py-10">
        <AccountView path={accountPath} />
      </div>
    </NeonAuthProvider>
  )
}
