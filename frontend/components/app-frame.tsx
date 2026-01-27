"use client"

import { usePathname } from "next/navigation"

import { TopBar } from "@/components/top-bar"

const HIDE_TOPBAR_PREFIXES = ["/auth"]

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hideTopBar =
    pathname === "/" ||
    HIDE_TOPBAR_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  return (
    <>
      {hideTopBar ? null : <TopBar />}
      {children}
    </>
  )
}
