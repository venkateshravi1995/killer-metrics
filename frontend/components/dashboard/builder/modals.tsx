"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

import type {
  DimensionDefinition,
  MetricDefinition,
  SeriesDefinition,
  TileConfig,
  VizType,
} from "../types"
import { getTileDefinitions } from "../tiles/registry"
import type { TileDefinition } from "../tiles/types"
import type { DeleteTarget } from "./state"
import { ConfiguratorPanel } from "./configurator-panel"
import { TileCard } from "./tile-card"

type CreateDashboardModalProps = {
  open: boolean
  name: string
  description: string
  isSaving: boolean
  onClose: () => void
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onCreate: () => void
}

type EditDashboardModalProps = {
  open: boolean
  name: string
  isSaving: boolean
  onClose: () => void
  onNameChange: (value: string) => void
}

type DeleteDashboardModalProps = {
  open: boolean
  target: DeleteTarget
  isBusy: boolean
  onClose: () => void
  onDelete: () => void
}

type TilePickerModalProps = {
  open: boolean
  metricsAvailable: boolean
  onClose: () => void
  onSelect: (type: VizType) => void
}

type ConfiguratorDrawerProps = {
  open: boolean
  tile: TileConfig | null
  series: SeriesDefinition[]
  metrics: MetricDefinition[]
  dimensions: DimensionDefinition[]
  onUpdate: (tileId: string, updates: Partial<TileConfig>) => void
  onClose: () => void
  mode?: "edit" | "create"
  onBack?: () => void
}

const tileCopy: Record<VizType, string[]> = {
  line: [
    "Track a metric over time to spot momentum shifts.",
    "Best for daily or weekly series with clear direction.",
    "Use when the slope matters more than exact totals.",
    "Layer segments with group-by to compare curves.",
    "Great default for retention, revenue, and growth.",
  ],
  area: [
    "Emphasize volume by filling under the curve.",
    "Ideal when magnitude and change both matter.",
    "Use for cumulative views or steady growth lines.",
    "Stack segments to show composition over time.",
    "Works well for pipeline, usage, and bookings.",
  ],
  bar: [
    "Compare discrete buckets across time or categories.",
    "Use when you need clear separation between groups.",
    "Great for rankings, top-k lists, and cohorts.",
    "Highlight changes between periods at a glance.",
    "Avoid for dense time series with tiny intervals.",
  ],
  donut: [
    "Show parts of a whole with a clean breakdown.",
    "Best with 3-7 segments for readability.",
    "Use to compare share-of-total in one snapshot.",
    "Highlight the leading segment and long tail.",
    "Pair with filters to explore segment makeup.",
  ],
  table: [
    "Deliver precise values with rich detail.",
    "Use when leaders need to scan, sort, or export.",
    "Best for top-k lists and multi-dimension views.",
    "Great companion to charts for exact numbers.",
    "Add filters to focus on the right slices fast.",
  ],
  kpi: [
    "Spotlight a single metric with a strong headline.",
    "Ideal for executive summaries and scorecards.",
    "Show deltas to surface momentum instantly.",
    "Add comparison periods for context and urgency.",
    "Place at the top to anchor the dashboard story.",
  ],
}

function TilePreview({ type }: { type: VizType }) {
  const previewShell =
    "flex h-24 w-full items-center justify-center rounded-xl border border-border/60 bg-muted/20"
  switch (type) {
    case "line":
      return (
        <div className={`${previewShell} text-primary`}>
          <svg
            viewBox="0 0 120 48"
            className="h-16 w-full"
            aria-hidden="true"
          >
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              points="0,36 18,30 34,34 52,22 70,26 88,14 106,20 120,10"
            />
            <circle cx="88" cy="14" r="3" fill="currentColor" />
          </svg>
        </div>
      )
    case "area":
      return (
        <div className={`${previewShell} text-primary`}>
          <svg viewBox="0 0 120 48" className="h-16 w-full" aria-hidden="true">
            <path
              d="M0,40 L16,28 L34,32 L52,18 L70,22 L88,12 L120,16 L120,48 L0,48 Z"
              fill="currentColor"
              opacity="0.2"
            />
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              points="0,40 16,28 34,32 52,18 70,22 88,12 120,16"
            />
          </svg>
        </div>
      )
    case "bar":
      return (
        <div className={`${previewShell} px-4`}>
          <div className="flex w-full items-end gap-2">
            {[10, 18, 12, 24, 16, 28].map((height, index) => (
              <span
                key={`${type}-bar-${index}`}
                className="flex-1 rounded-md bg-primary/70"
                style={{ height: `${height * 2}px` }}
              />
            ))}
          </div>
        </div>
      )
    case "donut":
      return (
        <div className={previewShell}>
          <div
            className="size-20 rounded-full"
            style={{
              background:
                "conic-gradient(#f97316 0 40%, #14b8a6 40% 68%, #eab308 68% 100%)",
            }}
            aria-hidden="true"
          />
        </div>
      )
    case "table":
      return (
        <div className={`${previewShell} px-4`}>
          <div className="flex w-full flex-col gap-2">
            {[1, 2, 3].map((row) => (
              <div key={`${type}-row-${row}`} className="flex gap-2">
                <span className="h-2 flex-1 rounded-full bg-muted-foreground/40" />
                <span className="h-2 w-12 rounded-full bg-primary/60" />
              </div>
            ))}
          </div>
        </div>
      )
    case "kpi":
      return (
        <div className={`${previewShell} flex-col gap-1 text-primary`}>
          <span className="font-display text-3xl font-semibold">98.4%</span>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
            +4.2% vs last
          </span>
        </div>
      )
    default:
      return <div className={previewShell} />
  }
}

export function CreateDashboardModal({
  open,
  name,
  description,
  isSaving,
  onClose,
  onNameChange,
  onDescriptionChange,
  onCreate,
}: CreateDashboardModalProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close create dashboard dialog"
      />
      <Card className="relative z-10 w-full max-w-lg rounded-2xl border-border/70 bg-card/95 p-4 shadow-xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              Create dashboard
            </h2>
            <p className="text-xs text-muted-foreground">
              Add a name and optional description.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </Button>
        </div>
        <Separator className="my-3" />
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="dashboard-create-name">Dashboard name</Label>
            <Input
              id="dashboard-create-name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Quarterly retention"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dashboard-create-description">Description</Label>
            <Textarea
              id="dashboard-create-description"
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="Optional context for this dashboard."
              rows={3}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="rounded-full"
            onClick={onCreate}
            disabled={isSaving || !name.trim()}
          >
            Create
          </Button>
        </div>
      </Card>
    </div>
  )
}

export function EditDashboardModal({
  open,
  name,
  isSaving,
  onClose,
  onNameChange,
}: EditDashboardModalProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close edit dashboard dialog"
      />
      <Card className="relative z-10 w-full max-w-lg rounded-2xl border-border/70 bg-card/95 p-4 shadow-xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              Edit dashboard
            </h2>
            <p className="text-xs text-muted-foreground">
              Update the dashboard name.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </Button>
        </div>
        <Separator className="my-3" />
        <div className="space-y-2">
          <Label htmlFor="dashboard-edit-name">Dashboard name</Label>
          <Input
            id="dashboard-edit-name"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Quarterly retention"
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                event.currentTarget.value.trim()
              ) {
                event.preventDefault()
                onClose()
              }
            }}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button
            className="rounded-full"
            onClick={onClose}
            disabled={isSaving || !name.trim()}
          >
            Done
          </Button>
        </div>
      </Card>
    </div>
  )
}

export function DeleteDashboardModal({
  open,
  target,
  isBusy,
  onClose,
  onDelete,
}: DeleteDashboardModalProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close delete dashboard dialog"
      />
      <Card className="relative z-10 w-full max-w-lg rounded-2xl border-border/70 bg-card/95 p-4 shadow-xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              Delete dashboard
            </h2>
            <p className="text-xs text-muted-foreground">
              This deletes the dashboard and any draft changes.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </Button>
        </div>
        <Separator className="my-3" />
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            You are about to delete{" "}
            <span className="font-semibold text-foreground">
              {target?.name ?? "this dashboard"}
            </span>
            . This action cannot be undone.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="rounded-full"
            onClick={onDelete}
            disabled={isBusy}
          >
            Delete
          </Button>
        </div>
      </Card>
    </div>
  )
}

export function TilePickerModal({
  open,
  metricsAvailable,
  onClose,
  onSelect,
}: TilePickerModalProps) {
  const tileDefinitions = useMemo(() => getTileDefinitions(), [])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-background/95 backdrop-blur">
      <div className="flex h-12 items-center justify-between border-b border-border/60 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-sm font-semibold text-foreground">
            New tile
          </h2>
          <span className="text-xs text-muted-foreground">
            Choose a visualization to configure next.
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
              Step 1 of 2
            </p>
            <h3 className="mt-2 font-display text-2xl font-semibold text-foreground">
              Pick the right visualization first.
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose a tile type, preview it, then configure the data and
              styling before adding it to the dashboard.
            </p>
          </div>
          <Separator className="my-6" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tileDefinitions.map((definition: TileDefinition) => {
              const copyLines =
                tileCopy[definition.type] ?? [definition.description]
              return (
                <Card
                  key={definition.type}
                  className="flex h-full flex-col gap-4 border-border/60 bg-card/80 p-4 shadow-sm"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Tile
                      </span>
                      <h3 className="font-display text-lg font-semibold text-foreground">
                        {definition.label}
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {definition.description}
                    </p>
                  </div>
                  <div className="space-y-1 text-sm leading-relaxed text-muted-foreground">
                    {copyLines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Preview
                    </p>
                    <TilePreview type={definition.type} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {definition.data.source} data
                    </div>
                    <Button
                      size="sm"
                      className="rounded-full"
                      disabled={!metricsAvailable}
                      onClick={() => onSelect(definition.type)}
                    >
                      Configure
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
          {!metricsAvailable ? (
            <p className="mt-4 text-xs text-rose-600">
              Add metrics first to enable new tiles.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function ConfiguratorDrawer({
  open,
  tile,
  series,
  metrics,
  dimensions,
  onUpdate,
  onClose,
  mode = "edit",
  onBack,
}: ConfiguratorDrawerProps) {
  const [draftTile, setDraftTile] = useState<TileConfig | null>(tile)
  const [baselineTile, setBaselineTile] = useState<TileConfig | null>(tile)
  const metricsByKey = useMemo(
    () => new Map(metrics.map((metric) => [metric.key, metric])),
    [metrics]
  )
  const dimensionsByKey = useMemo(
    () => new Map(dimensions.map((dimension) => [dimension.key, dimension])),
    [dimensions]
  )
  const handleSelect = useCallback(() => {}, [])
  const handleTileAction = useCallback((_tileId: string) => {}, [])
  const handleSeriesChange = useCallback(
    (_tileId: string, _series: SeriesDefinition[]) => {},
    []
  )

  useEffect(() => {
    if (!open) {
      return
    }
    setDraftTile(tile)
    setBaselineTile(tile)
  }, [open, tile?.id, tile])

  const isDirty = useMemo(() => {
    if (!draftTile || !baselineTile) {
      return false
    }
    return JSON.stringify(draftTile) !== JSON.stringify(baselineTile)
  }, [draftTile, baselineTile])

  const handleDraftUpdate = (tileId: string, updates: Partial<TileConfig>) => {
    setDraftTile((prev) => {
      if (!prev || prev.id !== tileId) {
        return prev
      }
      return { ...prev, ...updates }
    })
  }

  const handleUndo = () => {
    setDraftTile(baselineTile)
  }

  const handleSave = () => {
    if (!draftTile) {
      return
    }
    onUpdate(draftTile.id, draftTile)
    setBaselineTile(draftTile)
    onClose()
  }

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-background/95 backdrop-blur">
      <div className="flex h-12 items-center justify-between border-b border-border/60 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-sm font-semibold text-foreground">
            {mode === "create" ? "Configure new tile" : "Configure tile"}
          </h2>
          <span className="text-xs text-muted-foreground">
            {draftTile ? draftTile.title : "Select a tile to configure."}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 flex-1 flex-col border-b border-border/60 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Preview
          </div>
          <div className="flex min-h-0 flex-1 p-4">
            {draftTile ? (
              <div className="min-h-0 flex-1">
                <TileCard
                  tile={draftTile}
                  index={0}
                  editMode={false}
                  isSelected={false}
                  onSelect={handleSelect}
                  onConfigure={handleTileAction}
                  onDuplicate={handleSelect}
                  onRemove={handleSelect}
                  onSeriesChange={handleSeriesChange}
                  metricsByKey={metricsByKey}
                  dimensionsByKey={dimensionsByKey}
                />
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-center text-sm text-muted-foreground">
                <Sparkles className="mb-3 size-6" />
                Select a tile to configure.
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 w-full flex-col lg:w-[420px] xl:w-[480px]">
          <div className="flex min-h-0 flex-1 flex-col p-4">
            {draftTile ? (
              <ConfiguratorPanel
                tile={draftTile}
                onUpdate={handleDraftUpdate}
                metrics={metrics}
                dimensions={dimensions}
                series={series}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-center text-sm text-muted-foreground">
                Choose a tile to begin configuring.
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
            {mode === "create" && onBack ? (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={onBack}
              >
                Back
              </Button>
            ) : null}
            {isDirty && mode === "edit" ? (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={handleUndo}
              >
                Undo
              </Button>
            ) : null}
            {draftTile && (mode === "create" || isDirty) ? (
              <Button
                size="sm"
                className="rounded-full"
                onClick={handleSave}
              >
                {mode === "create" ? "Add tile" : "Save"}
              </Button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
