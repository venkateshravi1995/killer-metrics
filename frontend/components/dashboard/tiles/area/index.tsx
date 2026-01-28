"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatMetricValue, getPalette } from "../../data"
import { DefaultTileConfigurator } from "../configurator/default"
import type { AreaTileConfig } from "./config"
import { areaVisualDefaults } from "./config"
import type { TileConfiguratorComponent, TileDefinition, TileRenderProps } from "../types"
import { tooltipStyles } from "../shared/tooltip"

function AreaTile({
  tile,
  metrics,
  series,
  chartData,
  accentColor,
  xKey,
}: TileRenderProps<AreaTileConfig>) {
  const { visuals } = tile
  const strokeDasharray = visuals.lineStyle === "dashed" ? "6 6" : undefined
  const palette = getPalette(visuals.palette)
  const metricsByKey = new Map(metrics.map((entry) => [entry.key, entry]))
  const seriesByKey = new Map(series.map((entry) => [entry.key, entry]))
  const showComparison = visuals.showComparison && series.length === 1
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
      <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        {visuals.showGrid ? (
          <CartesianGrid strokeDasharray="4 6" stroke="var(--border)" />
        ) : null}
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
            <Area
              key={entry.key}
              type={visuals.smooth ? "monotone" : "linear"}
              dataKey={entry.key}
              name={entry.label}
              stroke={color}
              fill={color}
              fillOpacity={0.2}
              strokeWidth={visuals.lineWidth}
              strokeDasharray={strokeDasharray}
              dot={visuals.showPoints}
            />
          )
        })}
        {showComparison ? (
          <Line
            type={visuals.smooth ? "monotone" : "linear"}
            dataKey="comparison"
            name="Previous"
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            dot={false}
          />
        ) : null}
      </AreaChart>
    </ResponsiveContainer>
  )
}

const AreaConfigurator: TileConfiguratorComponent<AreaTileConfig> = (props) => (
  <DefaultTileConfigurator {...props} />
)

export const areaTileDefinition: TileDefinition<AreaTileConfig> = {
  type: "area",
  label: "Area",
  description: "Emphasize volume trends with a filled area chart.",
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
    lineWidth: true,
    showLegend: true,
    legendPosition: true,
    showGrid: true,
    smooth: true,
    showComparison: true,
    showPoints: true,
    lineStyle: true,
    axisLabels: true,
  },
  visualDefaults: areaVisualDefaults,
  render: AreaTile,
  configurator: AreaConfigurator,
  getMinSize: (tile) => {
    let minH = 4
    if (tile.visuals.showLegend) minH += 1
    if (tile.visuals.showComparison) minH += 1
    return { minW: 4, minH }
  },
}
