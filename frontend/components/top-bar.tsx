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
              Killer Metric Studio
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-lg font-semibold">
                Dashboard Control
              </span>
              <Badge
                variant="secondary"
                className="rounded-full text-[10px] uppercase"
              >
                Builder
              </Badge>
            </div>
          </div>
        </div>
        <div
          className="flex items-center gap-3 animate-stagger"
          style={{ ["--delay" as string]: "120ms" }}
        >
          <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs text-muted-foreground shadow-sm md:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Live sync
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
