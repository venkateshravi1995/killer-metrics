"use client"

import { Area, AreaChart, ResponsiveContainer } from "recharts"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { formatDelta, formatMetricValue } from "../../data"
import { DefaultTileConfigurator } from "../configurator/default"
import type { TileConfiguratorComponent, TileDefinition, TileRenderProps } from "../types"

function formatDeltaValue(value: number, metric: TileRenderProps["primaryMetric"]) {
  const formatted = formatMetricValue(Math.abs(value), metric)
  return `${value >= 0 ? "+" : "-"}${formatted}`
}

function formatKpiDelta(
  mode: TileRenderProps["tile"]["kpiDeltaMode"],
  value: number,
  percent: number,
  metric: TileRenderProps["primaryMetric"]
) {
  if (mode === "value") {
    return formatDeltaValue(value, metric)
  }
  if (mode === "both") {
    return `${formatDeltaValue(value, metric)} (${formatDelta(percent)})`
  }
  return formatDelta(percent)
}

function KpiTile({
  tile,
  primaryMetric,
  series,
  chartData,
  current,
  change,
  changePct,
  accentColor,
}: TileRenderProps) {
  const isPositive = changePct >= 0
  const deltaLabel = formatKpiDelta(
    tile.kpiDeltaMode,
    change,
    changePct,
    primaryMetric
  )
  const seriesKey = series[0]?.key ?? ""
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Current
        </div>
        <div className="mt-2 text-3xl font-semibold text-foreground">
          {formatMetricValue(current, primaryMetric)}
        </div>
      </div>
      <div className="flex items-center justify-between">
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
        {tile.showComparison ? (
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
  },
  render: KpiTile,
  configurator: KpiConfigurator,
  getMinSize: (tile) => {
    let minH = 4
    if (tile.showComparison) minH += 1
    return { minW: 3, minH }
  },
}
