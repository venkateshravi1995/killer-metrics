"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

import type { DimensionDefinition, MetricDefinition, SeriesDefinition, TileConfig } from "../types"
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

type ConfiguratorDrawerProps = {
  open: boolean
  tile: TileConfig | null
  series: SeriesDefinition[]
  metrics: MetricDefinition[]
  dimensions: DimensionDefinition[]
  onUpdate: (tileId: string, updates: Partial<TileConfig>) => void
  onClose: () => void
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

export function ConfiguratorDrawer({
  open,
  tile,
  series,
  metrics,
  dimensions,
  onUpdate,
  onClose,
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
            Configure tile
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
            {isDirty ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={handleUndo}
                >
                  Undo
                </Button>
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={handleSave}
                >
                  Save
                </Button>
              </>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
