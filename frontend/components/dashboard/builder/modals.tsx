"use client"

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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close create dashboard dialog"
      />
      <Card className="relative z-10 w-full max-w-lg rounded-2xl border-border/70 bg-card/95 p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
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
        <Separator className="my-4" />
        <div className="space-y-4">
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
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close delete dashboard dialog"
      />
      <Card className="relative z-10 w-full max-w-lg rounded-2xl border-border/70 bg-card/95 p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
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
        <Separator className="my-4" />
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            You are about to delete{" "}
            <span className="font-semibold text-foreground">
              {target?.name ?? "this dashboard"}
            </span>
            . This action cannot be undone.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
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
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 py-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close configurator"
      />
      <Card className="relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border-border/70 bg-card/95 shadow-xl max-h-[85vh]">
        <div className="flex items-start justify-between gap-4 p-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              Configurator
            </h2>
            <p className="text-xs text-muted-foreground">
              {tile ? `Editing ${tile.title}` : "Select a tile to configure."}
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
        <Separator />
        <div className="flex min-h-0 flex-1 flex-col p-3">
          {tile ? (
            <ConfiguratorPanel
              tile={tile}
              onUpdate={onUpdate}
              metrics={metrics}
              dimensions={dimensions}
              series={series}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <Sparkles className="mb-3 size-6" />
              Select a tile to configure.
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
