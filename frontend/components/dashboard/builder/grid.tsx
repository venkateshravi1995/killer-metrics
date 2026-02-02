"use client"

import type { Layout, ResponsiveProps } from "react-grid-layout"
import {
  Responsive as ResponsiveGridLayout,
  useContainerWidth,
} from "react-grid-layout"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

import type {
  DimensionDefinition,
  DimensionKey,
  MetricDefinition,
  MetricKey,
  SeriesDefinition,
  TileConfig,
} from "../types"
import { TileCard } from "./tile-card"
import { gridBreakpoints, gridCols, type BreakpointKey } from "./utils"

type GridLayouts = ResponsiveProps["layouts"]

const LOADING_TILES = Array.from({ length: 6 })

type DashboardGridProps = {
  tiles: TileConfig[]
  layouts: GridLayouts
  editMode: boolean
  isCompactView: boolean
  selectedTileId: string | null
  metricsByKey: Map<MetricKey, MetricDefinition>
  dimensionsByKey: Map<DimensionKey, DimensionDefinition>
  catalogStatus: "loading" | "ready" | "error"
  catalogError: string | null
  onSelectTile: (tileId: string) => void
  onConfigureTile: (tileId: string) => void
  onDuplicateTile: (tileId: string) => void
  onRemoveTile: (tileId: string) => void
  onSeriesChange: (tileId: string, series: SeriesDefinition[]) => void
  onLayoutCommit: (layout: Layout) => void
  onBreakpointChange: (breakpoint: BreakpointKey) => void
}

export function DashboardGrid({
  tiles,
  layouts,
  editMode,
  isCompactView,
  selectedTileId,
  metricsByKey,
  dimensionsByKey,
  catalogStatus,
  catalogError,
  onSelectTile,
  onConfigureTile,
  onDuplicateTile,
  onRemoveTile,
  onSeriesChange,
  onLayoutCommit,
  onBreakpointChange,
}: DashboardGridProps) {
  const isLayoutEditable = editMode && !isCompactView
  const { width, containerRef } = useContainerWidth()
  const dragConfig = isLayoutEditable
    ? { enabled: true, handle: ".tile-drag-handle" }
    : { enabled: false }
  const resizeConfig = isLayoutEditable
    ? { enabled: true, handles: ["se"] as const }
    : { enabled: false }

  return (
    <main
      data-edit-mode={editMode}
      ref={containerRef}
      className={cn(
        "dashboard-grid canvas-grid flex-1 min-h-[640px] px-6 pb-12 pt-4",
        editMode ? "bg-transparent" : "bg-card/30"
      )}
    >
      {tiles.length ? (
        <ResponsiveGridLayout
          className="layout"
          width={width}
          layouts={layouts}
          breakpoints={gridBreakpoints}
          cols={gridCols}
          rowHeight={36}
          margin={[16, 16]}
          containerPadding={[8, 8]}
          dragConfig={dragConfig}
          resizeConfig={resizeConfig}
          onBreakpointChange={(breakpoint) =>
            onBreakpointChange(breakpoint as BreakpointKey)
          }
          onDragStop={isLayoutEditable ? onLayoutCommit : undefined}
          onResizeStop={isLayoutEditable ? onLayoutCommit : undefined}
        >
          {tiles.map((tile, index) => (
            <div key={tile.id} className="h-full">
              <TileCard
                tile={tile}
                index={index}
                editMode={editMode}
                isSelected={editMode && tile.id === selectedTileId}
                onSelect={() => onSelectTile(tile.id)}
                onConfigure={onConfigureTile}
                onDuplicate={() => onDuplicateTile(tile.id)}
                onRemove={() => onRemoveTile(tile.id)}
                onSeriesChange={onSeriesChange}
                metricsByKey={metricsByKey}
                dimensionsByKey={dimensionsByKey}
              />
            </div>
          ))}
        </ResponsiveGridLayout>
      ) : (
        <>
          {catalogStatus === "loading" ? (
            <div className="grid w-full gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {LOADING_TILES.map((_, index) => (
                <div
                  key={`grid-skeleton-${index}`}
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
                          key={`grid-bar-${index}-${idx}`}
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
          ) : (
            <div className="flex h-[360px] items-center justify-center text-center text-sm text-muted-foreground">
              {catalogStatus === "error"
                ? catalogError ?? "Failed to load metrics."
                : "No metrics available."}
            </div>
          )}
        </>
      )}
    </main>
  )
}
