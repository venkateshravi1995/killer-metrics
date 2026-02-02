"use client"

import { useEffect, useMemo } from "react"
import {
  Copy,
  Filter,
  Grip,
  MoreVertical,
  SlidersHorizontal,
  Trash2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LoadingDots } from "@/components/ui/loading-indicator"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import { formatMetricValue, getPalette } from "../data"
import type {
  DimensionDefinition,
  DimensionKey,
  MetricDefinition,
  MetricKey,
  SeriesDefinition,
  TileConfig,
} from "../types"
import type { TileDefinition } from "../tiles/types"
import { useTileData } from "../use-tile-data"
import { getTileDefinition } from "../tiles/registry"

const LOADING_BARS = [30, 60, 45, 70, 40, 55, 35, 50]

export type TileCardProps = {
  tile: TileConfig
  index: number
  editMode: boolean
  isSelected: boolean
  onSelect: () => void
  onConfigure: (tileId: string) => void
  onDuplicate: () => void
  onRemove: () => void
  onSeriesChange: (tileId: string, series: SeriesDefinition[]) => void
  metricsByKey: Map<MetricKey, MetricDefinition>
  dimensionsByKey: Map<DimensionKey, DimensionDefinition>
}

export function TileCard({
  tile,
  index,
  editMode,
  isSelected,
  onSelect,
  onConfigure,
  onDuplicate,
  onRemove,
  onSeriesChange,
  metricsByKey,
  dimensionsByKey,
}: TileCardProps) {
  const tileDefinition = getTileDefinition(tile.vizType) as TileDefinition<TileConfig>
  const tileState = useTileData(tile, metricsByKey)
  const tileData = tileState.data
  const summary = tileData.summary
  const accentColor = getPalette(tile.visuals.palette).colors[0]
  const metric = tileData.primaryMetric
  const groupByLabels = tile.groupBy.map(
    (key) => dimensionsByKey.get(key)?.label ?? key
  )
  const filterChips = useMemo(() => {
    const grouped = new Map<string, Set<string>>()
    tile.filters.forEach((filter) => {
      if (!filter.dimension || !filter.values.length) {
        return
      }
      const entry = grouped.get(filter.dimension) ?? new Set<string>()
      filter.values.forEach((value) => {
        if (value) {
          entry.add(value)
        }
      })
      if (entry.size) {
        grouped.set(filter.dimension, entry)
      }
    })
    return Array.from(grouped.entries()).map(([dimension, values]) => ({
      key: dimension,
      label: dimensionsByKey.get(dimension)?.label ?? dimension,
      values: Array.from(values),
    }))
  }, [dimensionsByKey, tile.filters])
  const updatedLabel = useMemo(() => {
    if (!tileState.lastUpdated) {
      return null
    }
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(tileState.lastUpdated))
  }, [tileState.lastUpdated])
  const isLoading = tileState.status === "loading"
  const isError = tileState.status === "error"
  const TileRenderer = tileDefinition.render as TileDefinition<TileConfig>["render"]

  useEffect(() => {
    onSeriesChange(tile.id, tileData.series)
  }, [onSeriesChange, tile.id, tileData.series])

  return (
    <Card
      onClick={editMode ? onSelect : undefined}
      data-tile-id={tile.id}
      className={cn(
        "tile-card animate-stagger h-full gap-4 border-border/60 bg-card/85 p-4 shadow-sm transition",
        editMode
          ? "cursor-default hover:border-primary/30 hover:shadow-lg"
          : "cursor-default",
        isSelected ? "ring-2 ring-primary/40" : null
      )}
      style={{
        ["--delay" as string]: `${index * 60}ms`,
        borderTopColor: accentColor,
        borderTopWidth: "4px",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {editMode ? (
            <span className="tile-drag-handle mt-0.5 rounded-md bg-muted/70 p-1 text-muted-foreground">
              <Grip size={14} />
            </span>
          ) : null}
          <div>
            <div className="font-display text-sm font-semibold text-foreground">
              {tile.title}
            </div>
            {tile.description ? (
              <div className="text-xs text-muted-foreground">
                {tile.description}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isError || isLoading ? (
            <Badge
              variant={isError ? "destructive" : "outline"}
              className="rounded-full text-[10px]"
            >
              {isError ? (
                "Error"
              ) : (
                <span className="flex items-center gap-1">
                  <LoadingDots size="xs" className="text-muted-foreground" />
                  Loading
                </span>
              )}
            </Badge>
          ) : null}
          {filterChips.length > 0 ? (
            <Badge variant="secondary" className="rounded-full text-[10px]">
              <Filter size={12} className="mr-1" />
              {filterChips.length}
            </Badge>
          ) : null}
          {editMode ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm">
                  <MoreVertical size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onConfigure(tile.id)}
                  className="gap-2"
                >
                  <SlidersHorizontal size={14} />
                  Configure
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate} className="gap-2">
                  <Copy size={14} />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onRemove}
                  className="gap-2 text-rose-600"
                >
                  <Trash2 size={14} />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
      {filterChips.length ? (
        <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
          {filterChips.map((filter) => (
            <span
              key={filter.key}
              className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5"
            >
              {filter.label}: {filter.values.join(", ")}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex h-full flex-col gap-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="relative flex-1 rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="absolute inset-0 skeleton-shimmer opacity-60" />
              <div className="relative grid h-full grid-cols-8 items-end gap-2">
                {LOADING_BARS.map((height, idx) => (
                  <div
                    key={`tile-bar-${idx}`}
                    className="rounded-sm bg-muted/60"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-12" />
            </div>
          </div>
        ) : isError ? (
          <div className="flex h-full items-center justify-center text-center text-xs text-rose-600">
            Live data unavailable.
          </div>
        ) : (
          <TileRenderer
            tile={tile}
            metrics={tileData.metrics}
            primaryMetric={metric}
            chartData={tileData.chartData}
            series={tileData.series}
            xKey={tileData.xKey}
            aggregates={tileData.aggregates}
            groupByLabels={groupByLabels}
            current={summary?.current ?? 0}
            change={summary?.change ?? 0}
            changePct={summary?.changePct ?? 0}
            accentColor={accentColor}
          />
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{updatedLabel ? `Updated ${updatedLabel}` : ""}</span>
        <span className="font-medium text-foreground">
          {isLoading || isError || !summary
            ? "--"
            : formatMetricValue(summary.current, metric)}
        </span>
      </div>
    </Card>
  )
}
