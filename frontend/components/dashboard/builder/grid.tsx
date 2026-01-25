"use client"

import dynamic from "next/dynamic"
import type {
  Layout,
  LegacyResponsiveReactGridLayoutProps,
} from "react-grid-layout/legacy"
import { Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

import type {
  DimensionDefinition,
  DimensionKey,
  MetricDefinition,
  MetricKey,
  SeriesDefinition,
  TileConfig,
} from "../types"
import { ConfiguratorPanel } from "./configurator-panel"
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
  selectedTile: TileConfig | null
  selectedSeries: SeriesDefinition[]
  metrics: MetricDefinition[]
  dimensions: DimensionDefinition[]
  onUpdateTile: (tileId: string, updates: Partial<TileConfig>) => void
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
  selectedTile,
  selectedSeries,
  metrics,
  dimensions,
  onUpdateTile,
}: DashboardGridProps) {
  const isLayoutEditable = editMode && !isCompactView

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-6 px-6 pb-12 md:flex-row md:items-stretch">
      <main className="flex-1 min-h-0">
        <Card
          data-edit-mode={editMode}
          className={cn(
            "dashboard-grid min-h-[640px] border-border/60 bg-card/60 p-4 shadow-lg",
            editMode ? "canvas-grid" : "bg-card/60"
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
        </Card>
      </main>

      {editMode && !isCompactView ? (
        <aside className="flex min-h-0 w-full flex-col md:sticky md:top-6 md:self-start md:h-[calc(100vh-6rem)] md:w-72 lg:w-80 xl:w-96">
          <Card className="flex h-full min-h-0 flex-col overflow-hidden border-border/60 bg-card/70 p-3 shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">Configurator</h2>
                <p className="text-xs text-muted-foreground">
                  Adjust data and visuals.
                </p>
              </div>
              <Badge variant="secondary" className="rounded-full">
                {selectedTile ? "Active" : "Idle"}
              </Badge>
            </div>
            <Separator className="my-3" />
            <div className="flex min-h-0 flex-1 flex-col">
              {selectedTile ? (
                <ConfiguratorPanel
                  tile={selectedTile}
                  onUpdate={onUpdateTile}
                  metrics={metrics}
                  dimensions={dimensions}
                  series={selectedSeries}
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center text-center text-sm text-muted-foreground">
                  <Sparkles className="mb-3 size-6" />
                  Select a tile to configure.
                </div>
              )}
            </div>
          </Card>
        </aside>
      ) : null}
    </div>
  )
}
