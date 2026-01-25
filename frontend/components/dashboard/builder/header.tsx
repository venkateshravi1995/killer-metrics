"use client"

import {
  Eye,
  ForkKnife,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import type { DashboardSummary } from "../api"
import type { DashboardStatus, DraftStatus } from "./state"

export type DashboardHeaderProps = {
  dashboards: DashboardSummary[]
  activeDashboardId: string | null
  dashboardName: string
  dashboardDescription: string
  dashboardStatus: DashboardStatus
  dashboardError: string | null
  draftStatus: DraftStatus
  draftError: string | null
  hasDraft: boolean
  editMode: boolean
  isRenaming: boolean
  canAddTile: boolean
  onDashboardSelect: (value: string) => void
  onToggleRename: () => void
  onRenameDone: () => void
  onDashboardNameChange: (value: string) => void
  onDashboardDescriptionChange: (value: string) => void
  onOpenCreateModal: () => void
  onOpenDeleteModal: () => void
  onRefresh: () => void
  onToggleEditMode: () => void
  onSaveDashboard: () => void
  onAddTile: () => void
}

export function DashboardHeader({
  dashboards,
  activeDashboardId,
  dashboardName,
  dashboardDescription,
  dashboardStatus,
  dashboardError,
  draftStatus,
  draftError,
  hasDraft,
  editMode,
  isRenaming,
  canAddTile,
  onDashboardSelect,
  onToggleRename,
  onRenameDone,
  onDashboardNameChange,
  onDashboardDescriptionChange,
  onOpenCreateModal,
  onOpenDeleteModal,
  onRefresh,
  onToggleEditMode,
  onSaveDashboard,
  onAddTile,
}: DashboardHeaderProps) {
  return (
    <header className="shrink-0 flex flex-col gap-5 px-6 pb-4 pt-8 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
            <ForkKnife className="size-5" />
          </span>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {isRenaming ? (
              <Input
                className="h-10 w-full max-w-[420px] border-none bg-transparent px-0 text-3xl font-semibold tracking-tight text-foreground shadow-none focus-visible:ring-0"
                value={dashboardName}
                placeholder="Dashboard name"
                onChange={(event) => onDashboardNameChange(event.target.value)}
                onBlur={onRenameDone}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    onRenameDone()
                  }
                }}
              />
            ) : (
              <Select
                value={activeDashboardId ?? ""}
                onValueChange={onDashboardSelect}
                disabled={!dashboards.length}
              >
                <SelectTrigger className="h-10 w-full max-w-[420px] border-none bg-transparent px-0 text-3xl font-semibold tracking-tight text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0">
                  <SelectValue placeholder={dashboardName || "Select dashboard"} />
                </SelectTrigger>
                <SelectContent>
                  {dashboards.length ? (
                    dashboards.map((dashboard) => {
                      const label =
                        dashboard.id === activeDashboardId
                          ? dashboardName
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
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full"
                  onClick={onToggleRename}
                >
                  <Pencil size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit name</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full"
                  onClick={onOpenCreateModal}
                >
                  <Plus size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create dashboard</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full text-rose-600 hover:text-rose-600"
                  onClick={onOpenDeleteModal}
                  disabled={
                    !activeDashboardId ||
                    dashboardStatus === "saving" ||
                    dashboardStatus === "loading" ||
                    draftStatus === "saving"
                  }
                >
                  <Trash2 size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete dashboard</TooltipContent>
            </Tooltip>
            {dashboardStatus === "saving" ? (
              <Badge variant="secondary">Saving</Badge>
            ) : null}
            {dashboardStatus === "loading" ? (
              <Badge variant="secondary">Loading</Badge>
            ) : null}
            {draftStatus === "saving" ? <Badge variant="secondary">Syncing</Badge> : null}
            {hasDraft ? <Badge variant="outline">Draft</Badge> : null}
          </div>
        </div>
        {isRenaming ? (
          <Textarea
            className="min-h-[70px] resize-none border-border/60 bg-transparent text-sm text-foreground shadow-none focus-visible:ring-1"
            placeholder="Add a description"
            value={dashboardDescription}
            onChange={(event) => onDashboardDescriptionChange(event.target.value)}
          />
        ) : (
          <p
            className={cn(
              "text-sm",
              dashboardDescription
                ? "text-muted-foreground"
                : "text-muted-foreground/60"
            )}
          >
            {dashboardDescription || "Add a description"}
          </p>
        )}
        {dashboardError || draftError ? (
          <span className="text-xs text-destructive">
            {[dashboardError, draftError].filter(Boolean).join(" ")}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={onRefresh}
            >
              <RefreshCw size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={editMode ? "default" : "ghost"}
              size="icon"
              className="rounded-full"
              onClick={onToggleEditMode}
            >
              {editMode ? <Eye size={16} /> : <Pencil size={16} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{editMode ? "View" : "Edit"}</TooltipContent>
        </Tooltip>
        <Button
          className="gap-2 rounded-full"
          onClick={onSaveDashboard}
          disabled={
            dashboardStatus === "saving" ||
            dashboardStatus === "loading" ||
            draftStatus === "saving" ||
            !activeDashboardId ||
            !hasDraft
          }
        >
          <Save size={16} />
          Save
        </Button>
        {editMode ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
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
        ) : null}
      </div>
    </header>
  )
}
