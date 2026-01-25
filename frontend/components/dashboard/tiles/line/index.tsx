"use client"

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatMetricValue, getPalette } from "../../data"
import { DefaultTileConfigurator } from "../configurator/default"
import type { TileConfiguratorComponent, TileDefinition, TileRenderProps } from "../types"
import { tooltipStyles } from "../shared/tooltip"

function LineTile({
  tile,
  metrics,
  series,
  chartData,
  accentColor,
  xKey,
}: TileRenderProps) {
  const strokeDasharray = tile.lineStyle === "dashed" ? "6 6" : undefined
  const palette = getPalette(tile.palette)
  const metricsByKey = new Map(metrics.map((entry) => [entry.key, entry]))
  const seriesByKey = new Map(series.map((entry) => [entry.key, entry]))
  const showComparison = tile.showComparison && series.length === 1
  const legendProps =
    tile.legendPosition === "left" || tile.legendPosition === "right"
      ? {
          layout: "vertical" as const,
          align: tile.legendPosition,
          verticalAlign: "middle" as const,
        }
      : {
          layout: "horizontal" as const,
          align: "center" as const,
          verticalAlign: tile.legendPosition,
        }
  const xAxisTick = {
    fontSize: 11,
    fill: "var(--muted-foreground)",
    angle: tile.xAxisLabelAngle,
    textAnchor: tile.xAxisLabelAngle < 0 ? "end" : "middle",
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        {tile.showGrid ? (
          <CartesianGrid strokeDasharray="4 6" stroke="var(--border)" />
        ) : null}
        <XAxis
          dataKey={xKey}
          axisLine={false}
          tickLine={false}
          tick={xAxisTick}
          minTickGap={8}
          height={tile.xAxisLabelAngle ? 48 : 30}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          width={40}
        />
        <Tooltip
          formatter={(value: number, _name: string, props) => {
            const dataKey = String(props?.dataKey ?? "")
            const match = seriesByKey.get(dataKey)
            const metric = match?.metricKey
              ? metricsByKey.get(match.metricKey)
              : undefined
            return formatMetricValue(Number(value ?? 0), metric ?? metrics[0])
          }}
          contentStyle={tooltipStyles}
        />
        {tile.showLegend ? (
          <Legend {...legendProps} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
        ) : null}
        {series.map((entry, index) => {
          const colorOverride = tile.seriesColors[entry.key]
          const color =
            colorOverride ??
            (series.length === 1
              ? accentColor
              : palette.colors[index % palette.colors.length] ?? accentColor)
          return (
            <Line
              key={entry.key}
              type={tile.smooth ? "monotone" : "linear"}
              dataKey={entry.key}
              name={entry.label}
              stroke={color}
              strokeWidth={tile.lineWidth}
              strokeDasharray={strokeDasharray}
              dot={tile.showPoints}
            />
          )
        })}
        {showComparison ? (
          <Line
            type={tile.smooth ? "monotone" : "linear"}
            dataKey="comparison"
            name="Previous"
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            dot={false}
          />
        ) : null}
      </LineChart>
    </ResponsiveContainer>
  )
}

const LineConfigurator: TileConfiguratorComponent = (props) => (
  <DefaultTileConfigurator {...props} />
)

export const lineTileDefinition: TileDefinition = {
  type: "line",
  label: "Line",
  description: "Trend a metric over time with a line chart.",
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
  render: LineTile,
  configurator: LineConfigurator,
  getMinSize: (tile) => {
    let minH = 4
    if (tile.showLegend) minH += 1
    if (tile.showComparison) minH += 1
    return { minW: 4, minH }
  },
}
