"use client"

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

import { formatMetricValue, getPalette } from "../../data"
import { DefaultTileConfigurator } from "../configurator/default"
import type { DonutTileConfig, DonutTileVisuals } from "./config"
import { donutVisualDefaults } from "./config"
import type { TileConfiguratorComponent, TileDefinition, TileRenderProps } from "../types"
import { tooltipStyles } from "../shared/tooltip"

type PieLabelProps = {
  cx?: number
  cy?: number
  midAngle?: number
  innerRadius?: number
  outerRadius?: number
  percent?: number
  name?: string
  value?: number
}

const RADIAN = Math.PI / 180

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function buildLabelText(
  mode: DonutTileVisuals["donutLabelMode"],
  name: string,
  value: number,
  percent: number,
  metric: TileRenderProps<DonutTileConfig>["primaryMetric"]
) {
  if (mode === "name") {
    return name
  }
  if (mode === "value") {
    return formatMetricValue(value, metric)
  }
  if (mode === "percent") {
    return formatPercent(percent)
  }
  return `${name} ${formatPercent(percent)}`
}

function renderDonutLabel(
  props: PieLabelProps,
  tile: DonutTileConfig,
  metric: TileRenderProps<DonutTileConfig>["primaryMetric"],
  total: number
) {
  const {
    cx,
    cy,
    midAngle,
    innerRadius = 0,
    outerRadius = 0,
    percent,
    value = 0,
    name = "Segment",
  } = props

  if (
    cx === undefined ||
    cy === undefined ||
    midAngle === undefined ||
    total <= 0
  ) {
    return null
  }

  const resolvedPercent = percent ?? value / total
  const labelText = buildLabelText(
    tile.visuals.donutLabelMode,
    name,
    value,
    resolvedPercent,
    metric
  )
  const radius =
    tile.visuals.donutLabelPosition === "inside"
      ? innerRadius + (outerRadius - innerRadius) * 0.6
      : outerRadius + 14
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  const isRight = x > cx
  const fill =
    tile.visuals.donutLabelPosition === "inside"
      ? "var(--foreground)"
      : "var(--muted-foreground)"

  return (
    <text
      x={x}
      y={y}
      textAnchor={
        tile.visuals.donutLabelPosition === "inside"
          ? "middle"
          : isRight
            ? "start"
            : "end"
      }
      dominantBaseline="central"
      fontSize={11}
      fill={fill}
    >
      {labelText}
    </text>
  )
}

function buildCategoryLabel(dimensions: Record<string, string>, groupBy: string[]) {
  if (!groupBy.length) {
    return "Total"
  }
  const values = groupBy
    .map((key) => dimensions[key])
    .filter((value) => value && value.trim())
  return values.length ? values.join(" / ") : "Unknown"
}

function DonutTile({ tile, primaryMetric, aggregates }: TileRenderProps<DonutTileConfig>) {
  const palette = getPalette(tile.visuals.palette)
  const breakdown = aggregates
    .filter((group) => group.metricKey === primaryMetric.key)
    .map((group) => ({
      name: buildCategoryLabel(group.dimensions, tile.groupBy),
      value: group.value,
    }))
  const total = breakdown.reduce((acc, entry) => acc + entry.value, 0)
  const legendProps =
    tile.visuals.legendPosition === "left" || tile.visuals.legendPosition === "right"
      ? {
          layout: "vertical" as const,
          align: tile.visuals.legendPosition,
          verticalAlign: "middle" as const,
        }
      : {
          layout: "horizontal" as const,
          align: "center" as const,
          verticalAlign: tile.visuals.legendPosition,
        }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip
          formatter={(value: number | string | undefined) =>
            formatMetricValue(Number(value ?? 0), primaryMetric)
          }
          contentStyle={tooltipStyles}
        />
        {tile.visuals.showLegend ? (
          <Legend
            {...legendProps}
            iconType="circle"
            wrapperStyle={{ fontSize: "11px" }}
          />
        ) : null}
        <Pie
          data={breakdown}
          dataKey="value"
          nameKey="name"
          innerRadius={`${tile.visuals.donutInnerRadius}%`}
          outerRadius={`${tile.visuals.donutOuterRadius}%`}
          stroke="transparent"
          paddingAngle={tile.visuals.donutSlicePadding}
          label={
            tile.visuals.showDataLabels
              ? (props) => renderDonutLabel(props, tile, primaryMetric, total)
              : false
          }
          labelLine={
            tile.visuals.showDataLabels && tile.visuals.donutLabelPosition === "outside"
          }
        >
          {breakdown.map((entry, index) => (
            <Cell
              key={entry.name}
              fill={
                tile.visuals.seriesColors[entry.name] ??
                palette.colors[index % palette.colors.length]
              }
            />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  )
}

const DonutConfigurator: TileConfiguratorComponent<DonutTileConfig> = (props) => (
  <DefaultTileConfigurator {...props} />
)

export const donutTileDefinition: TileDefinition<DonutTileConfig> = {
  type: "donut",
  label: "Donut",
  description: "Show a proportional breakdown using a donut chart.",
  minSize: { w: 4, h: 4 },
  data: {
    source: "aggregate",
    range: "required",
    supportsGroupBy: true,
    maxMetrics: 1,
  },
  api: {
    method: "POST",
    endpoint: "/v1/query/aggregate",
    description: "Aggregated metric grouped by dimensions.",
  },
  visualOptions: {
    palette: true,
    seriesColors: true,
    showLegend: true,
    legendPosition: true,
    showDataLabels: true,
    donutLabelMode: true,
    donutLabelPosition: true,
    donutInnerRadius: true,
    donutOuterRadius: true,
    donutSlicePadding: true,
  },
  visualDefaults: donutVisualDefaults,
  render: DonutTile,
  configurator: DonutConfigurator,
  getMinSize: (tile) => {
    let minH = 4
    if (tile.visuals.showLegend) minH += 1
    return { minW: 4, minH }
  },
}
