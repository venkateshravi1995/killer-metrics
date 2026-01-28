"use client"

import { NeonAuthUIProvider } from "@neondatabase/auth/react"

import { neonAuthClient } from "@/lib/auth"

type NeonAuthProviderProps = {
  children: React.ReactNode
}

export function NeonAuthProvider({ children }: NeonAuthProviderProps) {
  return (
    <NeonAuthUIProvider
      authClient={neonAuthClient}
      redirectTo="/"
      social={{ providers: ["google"] }}
    >
      {children}
    </NeonAuthUIProvider>
  )
}
