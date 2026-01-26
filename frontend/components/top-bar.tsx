"use client"

import { LineChart } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"

export function TopBar() {
  return (
    <header className="topbar shrink-0">
      <div className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex items-center gap-3 animate-stagger"
          style={{ ["--delay" as string]: "40ms" }}
        >
          <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
            <LineChart className="size-5" />
          </span>
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground">
              Venky's Killer Metrics
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-lg font-semibold">
                Dashboard Control
              </span>
            </div>
          </div>
        </div>
        <div
          className="flex items-center gap-3 animate-stagger"
          style={{ ["--delay" as string]: "120ms" }}
        >
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
