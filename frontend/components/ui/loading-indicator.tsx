import { cn } from "@/lib/utils"

type LoadingOrbitProps = {
  className?: string
  size?: "sm" | "md" | "lg"
}

const orbitSizes: Record<NonNullable<LoadingOrbitProps["size"]>, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-8 w-8",
}

export function LoadingOrbit({ className, size = "md" }: LoadingOrbitProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("loading-orbit text-primary", orbitSizes[size], className)}
    />
  )
}

type LoadingDotsProps = {
  className?: string
  size?: "xs" | "sm" | "md"
}

const dotSizes: Record<NonNullable<LoadingDotsProps["size"]>, string> = {
  xs: "[--dot-size:3px]",
  sm: "[--dot-size:4px]",
  md: "[--dot-size:6px]",
}

export function LoadingDots({ className, size = "sm" }: LoadingDotsProps) {
  return (
    <span className={cn("loading-dots text-primary", dotSizes[size], className)}>
      <span />
      <span />
      <span />
    </span>
  )
}

type LoadingOverlayProps = {
  label?: string
  className?: string
}

export function LoadingOverlay({ label = "Loading", className }: LoadingOverlayProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-center gap-3 rounded-full border border-border/60 bg-card/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground shadow-sm">
        <LoadingOrbit size="sm" className="text-primary" />
        <span>{label}</span>
      </div>
    </div>
  )
}
