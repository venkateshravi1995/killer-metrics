"use client"

import { Area, AreaChart, ResponsiveContainer } from "recharts"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { formatDelta, formatMetricValue } from "../../data"
import { DefaultTileConfigurator } from "../configurator/default"
import type { TileConfiguratorComponent, TileDefinition, TileRenderProps } from "../types"

type KpiValueMode = NonNullable<TileRenderProps["tile"]["kpiValueMode"]>
type KpiSecondaryValue = NonNullable<TileRenderProps["tile"]["kpiSecondaryValue"]>
type KpiDeltaBasis = NonNullable<TileRenderProps["tile"]["kpiDeltaBasis"]>
type KpiDeltaStyle = NonNullable<TileRenderProps["tile"]["kpiDeltaStyle"]>
type KpiAlignment = NonNullable<TileRenderProps["tile"]["kpiAlignment"]>
type KpiValueSize = NonNullable<TileRenderProps["tile"]["kpiValueSize"]>
type KpiStatKey =
  | "current"
  | "average"
  | "min"
  | "max"
  | "sum"
  | "first"
  | "previous"

const KPI_LABELS: Record<KpiStatKey, string> = {
  current: "Current",
  average: "Average",
  min: "Minimum",
  max: "Maximum",
  sum: "Total",
  first: "Start",
  previous: "Previous",
}

type KpiStats = {
  values: number[]
  current: number | null
  first: number | null
  previous: number | null
  min: number | null
  max: number | null
  sum: number | null
  average: number | null
}

function formatDeltaValue(value: number, metric: TileRenderProps["primaryMetric"]) {
  const formatted = formatMetricValue(Math.abs(value), metric)
  return `${value >= 0 ? "+" : "-"}${formatted}`
}

function formatKpiDelta(
  mode: TileRenderProps["tile"]["kpiDeltaMode"],
  value: number | null,
  percent: number | null,
  metric: TileRenderProps["primaryMetric"]
) {
  if (value === null || !Number.isFinite(value)) {
    return null
  }
  if (mode === "value") {
    return formatDeltaValue(value, metric)
  }
  if (mode === "both") {
    if (percent === null || !Number.isFinite(percent)) {
      return formatDeltaValue(value, metric)
    }
    return `${formatDeltaValue(value, metric)} (${formatDelta(percent)})`
  }
  if (percent === null || !Number.isFinite(percent)) {
    return null
  }
  return formatDelta(percent)
}

function getSeriesValues(
  chartData: TileRenderProps["chartData"],
  seriesKey: string,
  fallbackCurrent: number
) {
  if (!seriesKey) {
    return Number.isFinite(fallbackCurrent) ? [fallbackCurrent] : []
  }
  const values = chartData
    .map((row) => Number(row[seriesKey] ?? 0))
    .filter((value) => Number.isFinite(value))
  if (!values.length && Number.isFinite(fallbackCurrent)) {
    return [fallbackCurrent]
  }
  return values
}

function buildKpiStats(values: number[]): KpiStats {
  if (!values.length) {
    return {
      values,
      current: null,
      first: null,
      previous: null,
      min: null,
      max: null,
      sum: null,
      average: null,
    }
  }
  const sum = values.reduce((total, value) => total + value, 0)
  return {
    values,
    current: values[values.length - 1] ?? null,
    first: values[0] ?? null,
    previous: values.length > 1 ? values[values.length - 2] ?? null : null,
    min: Math.min(...values),
    max: Math.max(...values),
    sum,
    average: sum / values.length,
  }
}

function resolveKpiValue(mode: KpiStatKey, stats: KpiStats) {
  if (mode === "current") return stats.current
  if (mode === "average") return stats.average
  if (mode === "min") return stats.min
  if (mode === "max") return stats.max
  if (mode === "sum") return stats.sum
  if (mode === "first") return stats.first
  if (mode === "previous") return stats.previous
  return stats.current
}

function KpiTile({
  tile,
  primaryMetric,
  series,
  chartData,
  current,
  accentColor,
}: TileRenderProps) {
  const valueMode: KpiValueMode = tile.kpiValueMode ?? "current"
  const secondaryMode: KpiSecondaryValue = tile.kpiSecondaryValue ?? "none"
  const deltaBasis: KpiDeltaBasis = tile.kpiDeltaBasis ?? "previous"
  const deltaMode = tile.kpiDeltaMode ?? "percent"
  const showDelta = tile.kpiShowDelta ?? true
  const deltaStyle: KpiDeltaStyle = tile.kpiDeltaStyle ?? "badge"
  const showLabel = tile.kpiShowLabel ?? true
  const alignment: KpiAlignment = tile.kpiAlignment ?? "left"
  const valueSize: KpiValueSize = tile.kpiValueSize ?? "lg"
  const seriesKey = series[0]?.key ?? ""
  const values = getSeriesValues(chartData, seriesKey, current)
  const stats = buildKpiStats(values)
  const primaryValue = resolveKpiValue(valueMode, stats) ?? 0
  const secondaryValue =
    secondaryMode === "none"
      ? null
      : resolveKpiValue(secondaryMode, stats)
  const secondaryLabel = secondaryMode === "none" ? "" : KPI_LABELS[secondaryMode]
  const basisKey: KpiStatKey =
    deltaBasis === "previous"
      ? "previous"
      : deltaBasis === "first"
        ? "first"
        : "average"
  const basisValue = resolveKpiValue(basisKey, stats)
  const deltaValue = basisValue === null ? null : primaryValue - basisValue
  const deltaPct =
    basisValue === null || basisValue === 0
      ? null
      : (deltaValue ?? 0) / basisValue * 100
  const deltaLabel = showDelta
    ? formatKpiDelta(deltaMode, deltaValue, deltaPct, primaryMetric)
    : null
  const isPositive = (deltaValue ?? 0) >= 0
  const canShowSparkline =
    tile.showComparison && chartData.length > 1 && Boolean(seriesKey)
  const showFooter = Boolean(deltaLabel || canShowSparkline)
  const alignmentClass =
    alignment === "center" ? "items-center text-center" : "items-start"
  const valueSizeClass = valueSize === "xl" ? "text-4xl" : "text-3xl"
  const footerClass = canShowSparkline && deltaLabel
    ? "justify-between"
    : canShowSparkline
      ? "justify-end"
      : alignment === "center"
        ? "justify-center"
        : "justify-start"
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-3",
        showFooter ? "justify-between" : "justify-start",
        alignmentClass
      )}
    >
      <div className={cn("flex flex-col gap-2", alignmentClass)}>
        {showLabel ? (
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {KPI_LABELS[valueMode]}
          </div>
        ) : null}
        <div className={cn(valueSizeClass, "font-semibold text-foreground")}>
          {formatMetricValue(primaryValue, primaryMetric)}
        </div>
        {secondaryValue !== null ? (
          <div className="text-xs text-muted-foreground">
            {secondaryLabel}: {formatMetricValue(secondaryValue, primaryMetric)}
          </div>
        ) : null}
      </div>
      {showFooter ? (
        <div className={cn("flex items-center gap-2", footerClass)}>
          {deltaLabel ? (
            deltaStyle === "inline" ? (
              <span
                className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  isPositive ? "text-emerald-700" : "text-rose-600"
                )}
              >
                {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {deltaLabel}
              </span>
            ) : (
              <Badge
                variant="outline"
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-1 text-xs",
                  isPositive ? "text-emerald-700" : "text-rose-600"
                )}
                style={{
                  borderColor: isPositive ? "#34d399" : "#fda4af",
                  backgroundColor: isPositive ? "#ecfdf3" : "#fff1f2",
                }}
              >
                {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {deltaLabel}
              </Badge>
            )
          ) : null}
          {canShowSparkline ? (
            <div className="h-12 w-24">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <Area
                    type={tile.smooth ? "monotone" : "linear"}
                    dataKey={seriesKey}
                    stroke={accentColor}
                    fill={accentColor}
                    fillOpacity={0.2}
                    strokeWidth={tile.lineWidth}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

const KpiConfigurator: TileConfiguratorComponent = (props) => (
  <DefaultTileConfigurator {...props} />
)

export const kpiTileDefinition: TileDefinition = {
  type: "kpi",
  label: "KPI",
  description: "Highlight the latest value and change.",
  minSize: { w: 3, h: 4 },
  data: {
    source: "kpi",
    range: "optional",
    supportsGroupBy: false,
    maxMetrics: 1,
  },
  api: {
    method: "POST",
    endpoint: "/v1/query/timeseries",
    description:
      "KPI tiles use timeseries and fall back to latest when the range is empty.",
  },
  visualOptions: {
    palette: true,
    lineWidth: true,
    smooth: true,
    showComparison: true,
    kpiDeltaMode: true,
    kpiValueMode: true,
    kpiSecondaryValue: true,
    kpiDeltaBasis: true,
    kpiShowDelta: true,
    kpiDeltaStyle: true,
    kpiShowLabel: true,
    kpiAlignment: true,
    kpiValueSize: true,
  },
  render: KpiTile,
  configurator: KpiConfigurator,
  getMinSize: (tile) => {
    const showLabel = tile.kpiShowLabel ?? true
    const showDelta = tile.kpiShowDelta ?? true
    const hasSecondary =
      (tile.kpiSecondaryValue ?? "none") !== "none"
    const valueSize = tile.kpiValueSize ?? "lg"
    let minH = valueSize === "xl" ? 3 : 2
    if (showLabel) minH += 1
    if (hasSecondary) minH += 1
    if (showDelta || tile.showComparison) minH += 1
    if (tile.showComparison) minH += 1
    return { minW: 3, minH }
  },
}
