import { LoadingOrbit } from "@/components/ui/loading-indicator"
import { Skeleton } from "@/components/ui/skeleton"

const LOADING_TILES = Array.from({ length: 6 })

export function DashboardLoading() {
  return (
    <div className="app-shell min-h-screen">
      <div className="canvas-grid min-h-screen">
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-16 pt-10">
          <section className="rounded-2xl border border-border/60 bg-card/80 px-5 py-4 shadow-sm backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
                <LoadingOrbit size="sm" />
              </span>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground">
                  Loading workspace
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-lg font-semibold">
                    Preparing your dashboard
                  </span>
                  <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                    Please wait
                  </span>
                </div>
              </div>
            </div>
          </section>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {LOADING_TILES.map((_, index) => (
              <div
                key={`tile-skeleton-${index}`}
                className="rounded-2xl border border-border/60 bg-card/85 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 p-4">
                  <div className="grid h-24 grid-cols-8 items-end gap-2">
                    {[30, 60, 45, 70, 40, 55, 35, 50].map((height, idx) => (
                      <div
                        key={`bar-${index}-${idx}`}
                        className="skeleton-shimmer rounded-sm bg-muted/60"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-5 w-12" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
