"use client"

import { NeonAuthUIProvider } from "@neondatabase/neon-js/auth/react/ui"

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
