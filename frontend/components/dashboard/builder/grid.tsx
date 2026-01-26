"use client"

import dynamic from "next/dynamic"
import type {
  Layout,
  LegacyResponsiveReactGridLayoutProps,
} from "react-grid-layout/legacy"
import { cn } from "@/lib/utils"

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

const ResponsiveGridLayout = dynamic<LegacyResponsiveReactGridLayoutProps>(
  () =>
    import("react-grid-layout/legacy").then((mod) =>
      mod.WidthProvider(mod.Responsive)
    ),
  { ssr: false }
)

type GridLayouts = LegacyResponsiveReactGridLayoutProps["layouts"]

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
  onLayoutCommit: (layout: Layout[]) => void
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

  return (
    <main
      data-edit-mode={editMode}
      className={cn(
        "dashboard-grid canvas-grid flex-1 min-h-[640px] px-6 pb-12 pt-4",
        editMode ? "bg-transparent" : "bg-card/30"
      )}
    >
      {tiles.length ? (
        <ResponsiveGridLayout
          className="layout"
          layouts={layouts}
          breakpoints={gridBreakpoints}
          cols={gridCols}
          rowHeight={36}
          margin={[16, 16]}
          containerPadding={[8, 8]}
          draggableHandle={isLayoutEditable ? ".tile-drag-handle" : undefined}
          isDraggable={isLayoutEditable}
          isResizable={isLayoutEditable}
          resizeHandles={isLayoutEditable ? ["se"] : []}
          compactType="vertical"
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
        <div className="flex h-[360px] items-center justify-center text-center text-sm text-muted-foreground">
          {catalogStatus === "loading"
            ? "Loading metrics..."
            : catalogStatus === "error"
              ? catalogError ?? "Failed to load metrics."
              : "No metrics available."}
        </div>
      )}
    </main>
  )
}
