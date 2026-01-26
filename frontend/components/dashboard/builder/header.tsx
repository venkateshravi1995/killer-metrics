"use client"

import {
  Clock,
  LineChart,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ThemeToggle } from "@/components/theme-toggle"

import type { DashboardSummary } from "../api"
import type { DashboardStatus, DraftStatus } from "./state"

export type DashboardHeaderProps = {
  dashboards: DashboardSummary[]
  activeDashboardId: string | null
  dashboardName: string
  dashboardStatus: DashboardStatus
  dashboardError: string | null
  draftStatus: DraftStatus
  draftError: string | null
  hasDraft: boolean
  isRenaming: boolean
  canAddTile: boolean
  refreshIntervalMs: number | null
  onDashboardSelect: (value: string) => void
  onToggleRename: () => void
  onOpenCreateModal: () => void
  onOpenDeleteModal: () => void
  onRefresh: () => void
  onRefreshIntervalChange: (value: number | null) => void
  onSaveDashboard: () => void
  onDiscardDraft: () => void
  onAddTile: () => void
}

const refreshOptions = [
  { label: "Off", value: "off" },
  { label: "2s", value: "2000" },
  { label: "10s", value: "10000" },
  { label: "30s", value: "30000" },
  { label: "1m", value: "60000" },
] as const
const pillGroupClass =
  "flex h-8 items-center gap-1 rounded-full border border-border/60 bg-background/80 px-1 shadow-sm backdrop-blur"

export function DashboardHeader({
  dashboards,
  activeDashboardId,
  dashboardName,
  dashboardStatus,
  dashboardError,
  draftStatus,
  draftError,
  hasDraft,
  isRenaming,
  canAddTile,
  refreshIntervalMs,
  onDashboardSelect,
  onToggleRename,
  onOpenCreateModal,
  onOpenDeleteModal,
  onRefresh,
  onRefreshIntervalChange,
  onSaveDashboard,
  onDiscardDraft,
  onAddTile,
}: DashboardHeaderProps) {
  const showDraftIndicator = hasDraft || draftStatus === "saving"
  const activeLabel = showDraftIndicator
    ? `(Draft) ${dashboardName}`
    : dashboardName
  const isBusy =
    dashboardStatus === "saving" ||
    dashboardStatus === "loading" ||
    draftStatus === "saving"
  const showUndoSave = Boolean(activeDashboardId && hasDraft && !isBusy)
  const refreshValue = refreshIntervalMs ? String(refreshIntervalMs) : "off"
  const refreshLabel =
    refreshOptions.find((option) => option.value === refreshValue)?.label ??
    "Off"

  return (
    <div className="[--topbar-height:128px] md:[--topbar-height:96px] lg:[--topbar-height:48px]">
      <div className="topbar-spacer" aria-hidden="true" />
      <header className="topbar topbar-fixed shrink-0">
        <div className="flex flex-col gap-2 px-4 py-2 sm:px-6">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:flex-nowrap">
              <div
                className="flex items-center gap-2 animate-stagger"
                style={{ ["--delay" as string]: "40ms" }}
              >
                <span className="flex size-8 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
                  <LineChart className="size-4" />
                </span>
                <span className="hidden text-[10px] uppercase tracking-[0.32em] text-muted-foreground lg:inline">
                  Venky's Killer Metrics
                </span>
              </div>
              <div
                className="flex min-w-0 flex-wrap items-center gap-2 animate-stagger lg:flex-nowrap"
                style={{ ["--delay" as string]: "120ms" }}
              >
                <div className="flex-1 min-w-[160px] lg:flex-none lg:w-auto">
                  <Select
                    value={activeDashboardId ?? ""}
                    onValueChange={onDashboardSelect}
                    disabled={!dashboards.length}
                  >
                    <SelectTrigger
                      size="sm"
                      data-draft={showDraftIndicator ? "true" : "false"}
                      className="h-8 w-full min-w-0 rounded-full border-border/60 bg-background/80 px-3 text-sm font-medium shadow-sm focus-visible:ring-1 lg:min-w-[180px] lg:max-w-[260px] data-[draft=true]:[&_[data-slot=select-value]]:text-amber-600 data-[draft=true]:[&_[data-slot=select-value]]:animate-vibrate dark:data-[draft=true]:[&_[data-slot=select-value]]:text-amber-400"
                    >
                      <SelectValue
                        placeholder={dashboardName || "Select dashboard"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {dashboards.length ? (
                        dashboards.map((dashboard) => {
                          const label =
                            dashboard.id === activeDashboardId
                              ? activeLabel
                              : dashboard.name
                          return (
                            <SelectItem key={dashboard.id} value={dashboard.id}>
                              {label}
                            </SelectItem>
                          )
                        })
                      ) : (
                        <SelectItem value="__empty" disabled>
                          No dashboards yet
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="secondary"
                      className="rounded-full shadow-sm"
                      onClick={onOpenCreateModal}
                      aria-label="Create dashboard"
                    >
                      <Plus size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Create dashboard</TooltipContent>
                </Tooltip>
                <div className={pillGroupClass}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-full"
                        onClick={onToggleRename}
                        aria-pressed={isRenaming}
                      >
                        <Pencil size={14} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit dashboard</TooltipContent>
                  </Tooltip>
                  {showUndoSave ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="rounded-full"
                          onClick={onDiscardDraft}
                        >
                          <RotateCcw size={14} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Undo changes</TooltipContent>
                    </Tooltip>
                  ) : null}
                  {showUndoSave ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="rounded-full"
                          onClick={onSaveDashboard}
                        >
                          <Save size={14} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Save dashboard</TooltipContent>
                    </Tooltip>
                  ) : null}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-full text-rose-600 hover:text-rose-600"
                        onClick={onOpenDeleteModal}
                        disabled={
                          !activeDashboardId || isBusy
                        }
                      >
                        <Trash2 size={14} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete dashboard</TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {dashboardStatus === "saving" ? (
                    <Badge variant="secondary" className="text-xs">
                      Saving
                    </Badge>
                  ) : null}
                  {dashboardStatus === "loading" ? (
                    <Badge variant="secondary" className="text-xs">
                      Loading
                    </Badge>
                  ) : null}
                  {draftStatus === "saving" ? (
                    <Badge variant="secondary" className="text-xs">
                      Syncing
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>
            <div
              className="flex flex-wrap items-center gap-2 animate-stagger lg:justify-end"
              style={{ ["--delay" as string]: "200ms" }}
            >
              <div className={pillGroupClass}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full"
                      onClick={onRefresh}
                      aria-label="Refresh dashboard"
                    >
                      <RefreshCw size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh now</TooltipContent>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="w-auto gap-1 rounded-full px-2 text-[10px] font-semibold"
                      aria-label="Auto refresh settings"
                    >
                      <Clock size={12} />
                      {refreshLabel}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuLabel>Auto refresh</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup
                      value={refreshValue}
                      onValueChange={(value) => {
                        const next =
                          value === "off" ? null : Number(value)
                        onRefreshIntervalChange(next)
                      }}
                    >
                      {refreshOptions.map((option) => (
                        <DropdownMenuRadioItem
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-2 rounded-full shadow-sm"
                    onClick={onAddTile}
                    disabled={!canAddTile}
                  >
                    <Plus size={16} />
                    New tile
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add a new tile</TooltipContent>
              </Tooltip>
              <ThemeToggle />
            </div>
          </div>
          {dashboardError || draftError ? (
            <span className="text-xs text-destructive">
              {[dashboardError, draftError].filter(Boolean).join(" ")}
            </span>
          ) : null}
        </div>
      </header>
    </div>
  )
}
