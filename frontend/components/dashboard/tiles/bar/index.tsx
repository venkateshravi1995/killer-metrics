"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatMetricValue, getPalette } from "../../data"
import { DefaultTileConfigurator } from "../configurator/default"
import type { BarTileConfig } from "./config"
import { barVisualDefaults } from "./config"
import type { TileConfiguratorComponent, TileDefinition, TileRenderProps } from "../types"
import { tooltipStyles } from "../shared/tooltip"

function BarTile({
  tile,
  metrics,
  series,
  chartData,
  accentColor,
  xKey,
}: TileRenderProps<BarTileConfig>) {
  const { visuals } = tile
  const isHorizontal = visuals.orientation === "horizontal"
  const palette = getPalette(visuals.palette)
  const metricsByKey = new Map(metrics.map((entry) => [entry.key, entry]))
  const seriesByKey = new Map(series.map((entry) => [entry.key, entry]))
  const legendProps =
    visuals.legendPosition === "left" || visuals.legendPosition === "right"
      ? {
          layout: "vertical" as const,
          align: visuals.legendPosition,
          verticalAlign: "middle" as const,
        }
      : {
          layout: "horizontal" as const,
          align: "center" as const,
          verticalAlign: visuals.legendPosition,
        }
  const xAxisTick = {
    fontSize: 11,
    fill: "var(--muted-foreground)",
    angle: visuals.xAxisLabelAngle,
    textAnchor: (visuals.xAxisLabelAngle < 0 ? "end" : "middle") as
      | "end"
      | "middle",
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        layout={isHorizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        barCategoryGap={`${visuals.barGap}%`}
      >
        {visuals.showGrid ? (
          <CartesianGrid strokeDasharray="4 6" stroke="var(--border)" />
        ) : null}
        {isHorizontal ? (
          <>
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              width={72}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey}
              axisLine={false}
              tickLine={false}
              tick={xAxisTick}
              minTickGap={8}
              height={visuals.xAxisLabelAngle ? 48 : 30}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              width={40}
            />
          </>
        )}
        <Tooltip
          formatter={(value: number | string | undefined, _name, props) => {
            const dataKey = String(props?.dataKey ?? "")
            const match = seriesByKey.get(dataKey)
            const metric = match?.metricKey
              ? metricsByKey.get(match.metricKey)
              : undefined
            return formatMetricValue(Number(value ?? 0), metric ?? metrics[0])
          }}
          contentStyle={tooltipStyles}
        />
        {visuals.showLegend ? (
          <Legend {...legendProps} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
        ) : null}
        {series.map((entry, index) => {
          const colorOverride = visuals.seriesColors[entry.key]
          const color =
            colorOverride ??
            (series.length === 1
              ? accentColor
              : palette.colors[index % palette.colors.length] ?? accentColor)
          return (
            <Bar
              key={entry.key}
              dataKey={entry.key}
              name={entry.label}
              fill={color}
              radius={visuals.barRadius}
            />
          )
        })}
      </BarChart>
    </ResponsiveContainer>
  )
}

const BarConfigurator: TileConfiguratorComponent<BarTileConfig> = (props) => (
  <DefaultTileConfigurator {...props} />
)

export const barTileDefinition: TileDefinition<BarTileConfig> = {
  type: "bar",
  label: "Bar",
  description: "Compare values across time buckets with bars.",
  minSize: { w: 4, h: 4 },
  data: {
    source: "timeseries",
    range: "required",
    supportsGroupBy: true,
    maxMetrics: undefined,
    allowedSources: ["timeseries", "aggregate"],
  },
  api: {
    method: "POST",
    endpoint: "/v1/query/timeseries",
    description: "Time series for a metric over a range with optional dimensions.",
  },
  visualOptions: {
    palette: true,
    seriesColors: true,
    showLegend: true,
    legendPosition: true,
    showGrid: true,
    orientation: true,
    barRadius: true,
    barGap: true,
    axisLabels: true,
  },
  visualDefaults: barVisualDefaults,
  render: BarTile,
  configurator: BarConfigurator,
  getMinSize: (tile) => {
    let minH = 4
    if (tile.visuals.showLegend) minH += 1
    return { minW: 4, minH }
  },
}
