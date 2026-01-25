"use client"

import { format, isValid } from "date-fns"
import { ChevronDown, Plus, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { DateTimePicker } from "@/components/ui/date-time-picker"

import { getPalette } from "../../data"
import type { DimensionKey, MetricKey, TileConfig, VizType } from "../../types"
import type { TileConfiguratorProps } from "../types"

const GRAIN_OPTIONS = [
  { value: "30m", label: "30 min" },
  { value: "hour", label: "Hourly" },
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "biweek", label: "Bi-weekly" },
  { value: "month", label: "Monthly" },
  { value: "quarter", label: "Quarterly" },
]

const sectionClass = "space-y-2 rounded-md border border-border/60 bg-card/60 p-2"

function parseIsoDate(value?: string | null) {
  if (!value) {
    return undefined
  }
  const parsed = new Date(value)
  return isValid(parsed) ? parsed : undefined
}

function formatAvailabilityRange(minDate?: Date, maxDate?: Date) {
  if (!minDate || !maxDate || !isValid(minDate) || !isValid(maxDate)) {
    return "No availability data for this selection."
  }
  return `${format(minDate, "PP p")} - ${format(maxDate, "PP p")}`
}

export function DefaultTileConfigurator({
  tile,
  onUpdate,
  metrics,
  dimensions,
  series,
  tileDefinition,
  tileDefinitions,
  activeTab,
  onTabChange,
  availability,
  availabilityStatus,
  availabilityError,
  dimensionValues,
  dimensionValuesStatus,
  addFilter,
  updateFilter,
  removeFilter,
  toggleMetric,
  toggleGroupBy,
  updateSeriesColor,
  clearSeriesColors,
}: TileConfiguratorProps) {
  const primaryMetricKey = tile.metricKeys[0] ?? ""
  const metric = metrics.find((item) => item.key === primaryMetricKey)
  const isGroupBy = tileDefinition.data.supportsGroupBy
  const dataSource = tile.dataSource ?? tileDefinition.data.source
  const apiDescriptor =
    dataSource === "aggregate"
      ? {
          method: "POST" as const,
          endpoint: "/v1/query/aggregate",
          description: "Aggregated metrics grouped by dimensions.",
        }
      : tileDefinition.api
  const visualOptions = tileDefinition.visualOptions
  const minAvailable = parseIsoDate(availability?.min_time_start_ts)
  const maxAvailable = parseIsoDate(availability?.max_time_start_ts)
  const hasAvailability = Boolean(minAvailable && maxAvailable)
  const availabilityLabel = (() => {
    if (availabilityStatus === "loading") {
      return "Loading availability..."
    }
    if (availabilityStatus === "error") {
      return availabilityError ?? "Failed to load availability."
    }
    return formatAvailabilityRange(minAvailable, maxAvailable)
  })()
  const rangeHint =
    tileDefinition.data.source === "kpi"
      ? "Times are shown in your local timezone. Leave blank to use the latest value."
      : "Times are shown in your local timezone. Leave blank to use the available range."
  const showGrain = dataSource !== "aggregate"
  const maxMetrics = tileDefinition.data.maxMetrics ?? metrics.length
  const isSingleMetric = maxMetrics === 1
  const metricSummary = (() => {
    if (!tile.metricKeys.length) {
      return "Select metrics"
    }
    const primary = metrics.find((item) => item.key === tile.metricKeys[0])
    if (tile.metricKeys.length === 1) {
      return primary?.label ?? tile.metricKeys[0]
    }
    const label = primary?.label ?? tile.metricKeys[0]
    return `${label} +${tile.metricKeys.length - 1}`
  })()
  const groupBySummary = tile.groupBy.length
    ? tile.groupBy
        .map((key) => dimensions.find((item) => item.key === key)?.label ?? key)
        .join(", ")
    : "None"
  const allowedSources = tileDefinition.data.allowedSources ?? [
    tileDefinition.data.source,
  ]
  const showSourcePicker = allowedSources.length > 1
  const canCompare =
    tile.metricKeys.length <= 1 &&
    tile.groupBy.length === 0 &&
    (dataSource === "timeseries" || tileDefinition.type === "kpi")
  const palette = getPalette(tile.palette)
  const hasSeriesOverrides = Object.keys(tile.seriesColors).length > 0

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabChange(value as "data" | "visuals")}
      className="flex flex-1 min-h-0 flex-col"
    >
      <TabsList className="grid h-9 grid-cols-2">
        <TabsTrigger value="data">Data</TabsTrigger>
        <TabsTrigger value="visuals">Visuals</TabsTrigger>
      </TabsList>
      <ScrollArea className="mt-2 flex-1 min-h-0 pr-1">
        <TabsContent value="data" className="space-y-3">
          <div className={sectionClass}>
            <div>
              <Label className="text-sm">Chart</Label>
              <p className="text-xs text-muted-foreground">
                Pick the visualization and data mode.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Visualization</Label>
              <Select
                value={tile.vizType}
                onValueChange={(value) =>
                  (() => {
                    const nextType = value as VizType
                    const nextDefinition =
                      tileDefinitions.find((definition) => definition.type === nextType) ??
                      tileDefinition
                    const nextAllowedSources =
                      nextDefinition.data.allowedSources ?? [nextDefinition.data.source]
                    const nextDataSource = nextAllowedSources.includes(tile.dataSource)
                      ? tile.dataSource
                      : nextAllowedSources[0]
                    const nextMaxMetrics =
                      nextDefinition.data.maxMetrics ?? metrics.length
                    const trimmedMetricKeys = tile.metricKeys.slice(0, nextMaxMetrics)
                    const nextMetricKeys =
                      trimmedMetricKeys.length > 0
                        ? trimmedMetricKeys
                        : metrics[0]?.key
                          ? [metrics[0].key]
                          : []
                    let nextGroupBy = nextDefinition.data.supportsGroupBy
                      ? tile.groupBy
                      : []
                    if (
                      nextDefinition.data.supportsGroupBy &&
                      nextDataSource === "aggregate" &&
                      nextGroupBy.length === 0
                    ) {
                      const fallbackDimension = dimensions[0]?.key
                      nextGroupBy = fallbackDimension ? [fallbackDimension] : []
                    }
                    const comparisonAllowed =
                      nextDefinition.type === "kpi" || nextDataSource === "timeseries"
                    const disableComparison =
                      tile.showComparison &&
                      (!comparisonAllowed ||
                        nextMetricKeys.length > 1 ||
                        nextGroupBy.length > 0)
                    onUpdate(tile.id, {
                      vizType: nextType,
                      dataSource: nextDataSource,
                      metricKeys: nextMetricKeys,
                      groupBy: nextGroupBy,
                      ...(disableComparison ? { showComparison: false } : {}),
                    })
                  })()
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select visualization" />
                </SelectTrigger>
                <SelectContent>
                  {tileDefinitions.map((definition) => (
                    <SelectItem key={definition.type} value={definition.type}>
                      {definition.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {showSourcePicker ? (
              <div className="space-y-2">
                <Label>Data mode</Label>
                <Select
                  value={dataSource}
                  onValueChange={(value) =>
                    (() => {
                      const nextSource = value as TileConfig["dataSource"]
                      let nextGroupBy = tile.groupBy
                      if (nextSource === "aggregate" && nextGroupBy.length === 0) {
                        const fallbackDimension = dimensions[0]?.key
                        nextGroupBy = fallbackDimension ? [fallbackDimension] : []
                      }
                      const comparisonAllowed =
                        tileDefinition.type === "kpi" || nextSource === "timeseries"
                      const disableComparison =
                        tile.showComparison &&
                        (!comparisonAllowed ||
                          tile.metricKeys.length > 1 ||
                          nextGroupBy.length > 0)
                      onUpdate(tile.id, {
                        dataSource: nextSource,
                        groupBy: nextGroupBy,
                        ...(disableComparison ? { showComparison: false } : {}),
                      })
                    })()
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select data mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedSources.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source === "aggregate" ? "Categorical" : "Time series"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div className={sectionClass}>
            <div>
              <Label className="text-sm">Tile</Label>
              <p className="text-xs text-muted-foreground">
                Name and description shown on the dashboard.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={tile.title}
                onChange={(event) => onUpdate(tile.id, { title: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={tile.description}
                onChange={(event) =>
                  onUpdate(tile.id, { description: event.target.value })
                }
              />
            </div>
          </div>

          <div className={sectionClass}>
            <div>
              <Label className="text-sm">Fields</Label>
              <p className="text-xs text-muted-foreground">
                Choose metrics and breakdowns.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Metrics</Label>
              {isSingleMetric ? (
                <Select
                  value={tile.metricKeys[0] ?? ""}
                  onValueChange={(value) =>
                    onUpdate(tile.id, { metricKeys: [value as MetricKey] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select metric" />
                  </SelectTrigger>
                  <SelectContent>
                    {metrics.map((metric) => (
                      <SelectItem key={metric.key} value={metric.key}>
                        {metric.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span>{metricSummary}</span>
                      <ChevronDown size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    {metrics.map((metric) => {
                      const isChecked = tile.metricKeys.includes(metric.key)
                      const disabled =
                        (!isChecked && tile.metricKeys.length >= maxMetrics) ||
                        (isChecked && tile.metricKeys.length === 1)
                      return (
                        <DropdownMenuCheckboxItem
                          key={metric.key}
                          checked={isChecked}
                          disabled={disabled}
                          onCheckedChange={(checked) =>
                            toggleMetric(metric.key, Boolean(checked))
                          }
                        >
                          {metric.label}
                        </DropdownMenuCheckboxItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <p className="text-xs text-muted-foreground">
                {tile.metricKeys.length > 1
                  ? "Multiple metrics selected."
                  : metric?.description}
              </p>
            </div>
            {isGroupBy ? (
              <div className="space-y-2">
                <Label>{dataSource === "timeseries" ? "Series by" : "Group by"}</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span>{groupBySummary}</span>
                      <ChevronDown size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    {dimensions.map((dimension) => {
                      const isChecked = tile.groupBy.includes(dimension.key)
                      return (
                        <DropdownMenuCheckboxItem
                          key={dimension.key}
                          checked={isChecked}
                          onCheckedChange={(checked) =>
                            toggleGroupBy(dimension.key, Boolean(checked))
                          }
                        >
                          {dimension.label}
                        </DropdownMenuCheckboxItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-xs text-muted-foreground">
                  {dataSource === "timeseries"
                    ? "Split series by selected dimensions."
                    : "Bucket values by selected dimensions."}
                </p>
              </div>
            ) : null}
          </div>

          <div className={sectionClass}>
            <div>
              <Label className="text-sm">Time</Label>
              <p className="text-xs text-muted-foreground">{rangeHint}</p>
            </div>
            {showGrain ? (
              <div className="space-y-2">
                <Label>Grain</Label>
                <Select
                  value={tile.grain}
                  onValueChange={(value) =>
                    onUpdate(tile.id, { grain: value as TileConfig["grain"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select grain" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRAIN_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Available range</Label>
                {hasAvailability ? (
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() =>
                      onUpdate(tile.id, {
                        startTime: minAvailable?.toISOString() ?? "",
                        endTime: maxAvailable?.toISOString() ?? "",
                      })
                    }
                  >
                    Use full range
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">{availabilityLabel}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Start time</Label>
                <DateTimePicker
                  value={parseIsoDate(tile.startTime)}
                  onChange={(date) =>
                    onUpdate(tile.id, {
                      startTime: date ? date.toISOString() : "",
                    })
                  }
                  minDate={minAvailable}
                  maxDate={maxAvailable}
                  placeholder="Auto (available range)"
                  defaultTime="00:00"
                />
              </div>
              <div className="space-y-2">
                <Label>End time</Label>
                <DateTimePicker
                  value={parseIsoDate(tile.endTime)}
                  onChange={(date) =>
                    onUpdate(tile.id, { endTime: date ? date.toISOString() : "" })
                  }
                  minDate={minAvailable}
                  maxDate={maxAvailable}
                  placeholder="Auto (available range)"
                  defaultTime="23:59"
                />
              </div>
            </div>
          </div>

          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Filters</Label>
                <p className="text-xs text-muted-foreground">
                  Blend dimensions to focus the metric.
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={addFilter}>
                <Plus size={14} className="mr-1" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {tile.filters.map((filter) => (
                <div
                  key={filter.id}
                  className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
                >
                  <Select
                    value={filter.dimension}
                    onValueChange={(value) => {
                      const dimension = value as DimensionKey
                      const values = dimensionValues[dimension] ?? []
                      updateFilter(filter.id, {
                        dimension,
                        values: values.length ? [values[0]] : [],
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Dimension" />
                    </SelectTrigger>
                    <SelectContent>
                      {dimensions.map((dimension) => (
                        <SelectItem key={dimension.key} value={dimension.key}>
                          {dimension.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        <span className="truncate">
                          {filter.values.length
                            ? filter.values.join(", ")
                            : "Select values"}
                        </span>
                        <ChevronDown size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                      {dimensionValuesStatus[filter.dimension] === "loading" ? (
                        <DropdownMenuItem disabled>
                          Loading values...
                        </DropdownMenuItem>
                      ) : (dimensionValues[filter.dimension] ?? []).length ? (
                        (dimensionValues[filter.dimension] ?? []).map((value) => {
                          const isChecked = filter.values.includes(value)
                          return (
                            <DropdownMenuCheckboxItem
                              key={value}
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const next = new Set(filter.values)
                                if (checked) {
                                  next.add(value)
                                } else {
                                  next.delete(value)
                                }
                                updateFilter(filter.id, { values: Array.from(next) })
                              }}
                            >
                              {value}
                            </DropdownMenuCheckboxItem>
                          )
                        })
                      ) : (
                        <DropdownMenuItem disabled>
                          No values available
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeFilter(filter.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
              {tile.filters.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
                  No filters yet. Add one to scope the tile.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground">
                {apiDescriptor.method} {apiDescriptor.endpoint}
              </span>
              <Badge variant="secondary" className="rounded-full text-[10px]">
                {tileDefinition.label.toUpperCase()}
              </Badge>
            </div>
            <p className="mt-1 text-muted-foreground">{apiDescriptor.description}</p>
          </div>
        </TabsContent>

        <TabsContent value="visuals" className="space-y-3">
          {visualOptions.seriesColors ? (
            <div className={sectionClass}>
              <div>
                <Label className="text-sm">Colors</Label>
                <p className="text-xs text-muted-foreground">
                  Assign custom colors per series. Defaults fill the rest.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Series colors</Label>
                  {hasSeriesOverrides ? (
                    <Button size="xs" variant="ghost" onClick={clearSeriesColors}>
                      Reset all
                    </Button>
                  ) : null}
                </div>
                {series.length ? (
                  <div className="space-y-2">
                    {series.map((entry, index) => {
                      const fallback = palette.colors[index % palette.colors.length]
                      const custom = tile.seriesColors[entry.key]
                      const colorValue = custom ?? fallback
                      return (
                        <div
                          key={entry.key}
                          className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/80 p-2"
                        >
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {entry.label}
                            </div>
                            {series.length > 1 ? (
                              <div className="text-xs text-muted-foreground">
                                {entry.metricKey}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={colorValue}
                              onChange={(event) =>
                                updateSeriesColor(entry.key, event.target.value)
                              }
                              className="h-8 w-10 cursor-pointer rounded border border-border/60 bg-transparent p-1"
                            />
                            <Button
                              size="xs"
                              variant="ghost"
                              disabled={!custom}
                              onClick={() => updateSeriesColor(entry.key, null)}
                            >
                              Reset
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border/60 p-2 text-xs text-muted-foreground">
                    No series yet. Load data to customize colors.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {visualOptions.showLegend || visualOptions.legendPosition ? (
            <div className={sectionClass}>
              <div>
                <Label className="text-sm">Legend</Label>
                <p className="text-xs text-muted-foreground">
                  Control legend visibility and placement.
                </p>
              </div>
              {visualOptions.showLegend ? (
                <label className="flex items-center justify-between text-sm">
                  <span>Show legend</span>
                  <Switch
                    checked={tile.showLegend}
                    onCheckedChange={(value) =>
                      onUpdate(tile.id, { showLegend: value })
                    }
                  />
                </label>
              ) : null}
              {visualOptions.legendPosition && tile.showLegend ? (
                <div className="space-y-2">
                  <Label>Legend position</Label>
                  <Select
                    value={tile.legendPosition}
                    onValueChange={(value) =>
                      onUpdate(tile.id, {
                        legendPosition: value as TileConfig["legendPosition"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select legend position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="top">Top</SelectItem>
                      <SelectItem value="bottom">Bottom</SelectItem>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          ) : null}

          {visualOptions.axisLabels ? (
            <div className={sectionClass}>
              <div>
                <Label className="text-sm">Axes</Label>
                <p className="text-xs text-muted-foreground">
                  Keep axis labels readable at any range.
                </p>
              </div>
              {dataSource === "timeseries" ? (
                <div className="space-y-2">
                  <Label>X-axis label format</Label>
                  <Select
                    value={tile.xAxisLabelMode}
                    onValueChange={(value) =>
                      onUpdate(tile.id, {
                        xAxisLabelMode: value as TileConfig["xAxisLabelMode"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select label format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (smart)</SelectItem>
                      <SelectItem value="short">Short</SelectItem>
                      <SelectItem value="full">Full (with year)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>X-axis label angle</Label>
                <Select
                  value={String(tile.xAxisLabelAngle)}
                  onValueChange={(value) =>
                    onUpdate(tile.id, { xAxisLabelAngle: Number(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select label angle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{"0\u00B0 (Horizontal)"}</SelectItem>
                    <SelectItem value="-30">{"-30\u00B0"}</SelectItem>
                    <SelectItem value="-45">{"-45\u00B0"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {visualOptions.orientation ||
          visualOptions.lineWidth ||
          visualOptions.lineStyle ||
          visualOptions.barRadius ||
          visualOptions.barGap ||
          visualOptions.showGrid ||
          visualOptions.smooth ||
          visualOptions.showComparison ||
          visualOptions.showPoints ||
          visualOptions.showDataLabels ? (
            <div className={sectionClass}>
              <div>
                <Label className="text-sm">Style</Label>
                <p className="text-xs text-muted-foreground">
                  Adjust chart appearance and interactions.
                </p>
              </div>
              {visualOptions.orientation ? (
                <div className="space-y-2">
                  <Label>Orientation</Label>
                  <Select
                    value={tile.orientation}
                    onValueChange={(value) =>
                      onUpdate(tile.id, {
                        orientation: value as TileConfig["orientation"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Orientation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vertical">Vertical</SelectItem>
                      <SelectItem value="horizontal">Horizontal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {visualOptions.lineWidth ? (
                <div className="space-y-2">
                  <Label>Line weight</Label>
                  <Slider
                    min={1}
                    max={4}
                    step={0.5}
                    value={[tile.lineWidth]}
                    onValueChange={(value) =>
                      onUpdate(tile.id, { lineWidth: value[0] })
                    }
                  />
                </div>
              ) : null}
              {visualOptions.lineStyle ? (
                <div className="space-y-2">
                  <Label>Line style</Label>
                  <Select
                    value={tile.lineStyle}
                    onValueChange={(value) =>
                      onUpdate(tile.id, {
                        lineStyle: value as TileConfig["lineStyle"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select line style" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solid">Solid</SelectItem>
                      <SelectItem value="dashed">Dashed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {visualOptions.barRadius ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Bar radius</Label>
                    <span className="text-xs text-muted-foreground">
                      {tile.barRadius}px
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={12}
                    step={1}
                    value={[tile.barRadius]}
                    onValueChange={(value) =>
                      onUpdate(tile.id, { barRadius: value[0] })
                    }
                  />
                </div>
              ) : null}
              {visualOptions.barGap ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Bar gap</Label>
                    <span className="text-xs text-muted-foreground">
                      {tile.barGap}%
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={30}
                    step={2}
                    value={[tile.barGap]}
                    onValueChange={(value) =>
                      onUpdate(tile.id, { barGap: value[0] })
                    }
                  />
                </div>
              ) : null}
              {visualOptions.showGrid ||
              visualOptions.smooth ||
              visualOptions.showComparison ||
              visualOptions.showPoints ||
              visualOptions.showDataLabels ? (
                <div className="grid gap-2">
                  {visualOptions.showGrid ? (
                    <label className="flex items-center justify-between text-sm">
                      <span>Show gridlines</span>
                      <Switch
                        checked={tile.showGrid}
                        onCheckedChange={(value) =>
                          onUpdate(tile.id, { showGrid: value })
                        }
                      />
                    </label>
                  ) : null}
                  {visualOptions.smooth ? (
                    <label className="flex items-center justify-between text-sm">
                      <span>Smooth curves</span>
                      <Switch
                        checked={tile.smooth}
                        onCheckedChange={(value) =>
                          onUpdate(tile.id, { smooth: value })
                        }
                      />
                    </label>
                  ) : null}
                  {visualOptions.showPoints ? (
                    <label className="flex items-center justify-between text-sm">
                      <span>Data points</span>
                      <Switch
                        checked={tile.showPoints}
                        onCheckedChange={(value) =>
                          onUpdate(tile.id, { showPoints: value })
                        }
                      />
                    </label>
                  ) : null}
                  {visualOptions.showComparison && canCompare ? (
                    <label className="flex items-center justify-between text-sm">
                      <span>Comparison overlay</span>
                      <Switch
                        checked={tile.showComparison}
                        onCheckedChange={(value) =>
                          onUpdate(tile.id, { showComparison: value })
                        }
                      />
                    </label>
                  ) : null}
                  {visualOptions.showDataLabels ? (
                    <label className="flex items-center justify-between text-sm">
                      <span>Data labels</span>
                      <Switch
                        checked={tile.showDataLabels}
                        onCheckedChange={(value) =>
                          onUpdate(tile.id, { showDataLabels: value })
                        }
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {visualOptions.donutLabelMode ||
          visualOptions.donutLabelPosition ||
          visualOptions.donutInnerRadius ||
          visualOptions.donutOuterRadius ||
          visualOptions.donutSlicePadding ? (
            <div className={sectionClass}>
              <div>
                <Label className="text-sm">Donut</Label>
                <p className="text-xs text-muted-foreground">
                  Fine-tune the donut layout and labels.
                </p>
              </div>
              {visualOptions.donutLabelMode && tile.showDataLabels ? (
                <div className="space-y-2">
                  <Label>Label content</Label>
                  <Select
                    value={tile.donutLabelMode}
                    onValueChange={(value) =>
                      onUpdate(tile.id, {
                        donutLabelMode: value as TileConfig["donutLabelMode"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select label content" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="value">Value</SelectItem>
                      <SelectItem value="percent">Percent</SelectItem>
                      <SelectItem value="name_percent">Name + percent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {visualOptions.donutLabelPosition && tile.showDataLabels ? (
                <div className="space-y-2">
                  <Label>Label position</Label>
                  <Select
                    value={tile.donutLabelPosition}
                    onValueChange={(value) =>
                      onUpdate(tile.id, {
                        donutLabelPosition: value as TileConfig["donutLabelPosition"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select label position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inside">Inside</SelectItem>
                      <SelectItem value="outside">Outside</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {visualOptions.donutInnerRadius ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Donut hole</Label>
                    <span className="text-xs text-muted-foreground">
                      {tile.donutInnerRadius}%
                    </span>
                  </div>
                  <Slider
                    min={35}
                    max={70}
                    step={5}
                    value={[tile.donutInnerRadius]}
                    onValueChange={(value) =>
                      onUpdate(tile.id, { donutInnerRadius: value[0] })
                    }
                  />
                </div>
              ) : null}
              {visualOptions.donutOuterRadius ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Donut size</Label>
                    <span className="text-xs text-muted-foreground">
                      {tile.donutOuterRadius}%
                    </span>
                  </div>
                  <Slider
                    min={65}
                    max={95}
                    step={5}
                    value={[tile.donutOuterRadius]}
                    onValueChange={(value) =>
                      onUpdate(tile.id, { donutOuterRadius: value[0] })
                    }
                  />
                </div>
              ) : null}
              {visualOptions.donutSlicePadding ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Slice gap</Label>
                    <span className="text-xs text-muted-foreground">
                      {tile.donutSlicePadding}px
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={8}
                    step={1}
                    value={[tile.donutSlicePadding]}
                    onValueChange={(value) =>
                      onUpdate(tile.id, { donutSlicePadding: value[0] })
                    }
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {visualOptions.kpiDeltaMode ? (
            <div className={sectionClass}>
              <div>
                <Label className="text-sm">KPI</Label>
                <p className="text-xs text-muted-foreground">
                  Choose how deltas appear in the tile.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Delta display</Label>
                <Select
                  value={tile.kpiDeltaMode}
                  onValueChange={(value) =>
                    onUpdate(tile.id, {
                      kpiDeltaMode: value as TileConfig["kpiDeltaMode"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select delta display" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent</SelectItem>
                    <SelectItem value="value">Value</SelectItem>
                    <SelectItem value="both">Value + percent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </TabsContent>
      </ScrollArea>
    </Tabs>
  )
}
