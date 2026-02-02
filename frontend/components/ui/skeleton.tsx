import { cn } from "@/lib/utils"

type SkeletonProps = {
  className?: string
  variant?: "block" | "text" | "circle"
}

export function Skeleton({ className, variant = "block" }: SkeletonProps) {
  const shape =
    variant === "circle"
      ? "rounded-full"
      : variant === "text"
        ? "rounded-md"
        : "rounded-lg"
  return (
    <div
      aria-hidden="true"
      className={cn("skeleton-shimmer bg-muted/50", shape, className)}
    />
  )
}
