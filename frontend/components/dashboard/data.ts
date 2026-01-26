import type { MetricDefinition, PaletteOption, TileConfig } from "./types"

export const paletteOptions: PaletteOption[] = [
  {
    id: "ember",
    label: "Ember",
    colors: ["#F97316", "#EA580C", "#FDBA74", "#F59E0B", "#FDE68A"],
  },
  {
    id: "lagoon",
    label: "Lagoon",
    colors: ["#0EA5E9", "#14B8A6", "#22C55E", "#84CC16", "#EAB308"],
  },
  {
    id: "copper",
    label: "Copper",
    colors: ["#9C6644", "#B08968", "#DDB892", "#7F5539", "#E6CCB2"],
  },
  {
    id: "sunset",
    label: "Sunset",
    colors: ["#F43F5E", "#FB7185", "#F97316", "#FDE047", "#FDBA74"],
  },
]

export const tileDefaults: Omit<
  TileConfig,
  "id" | "title" | "description" | "metricKeys" | "vizType" | "layout"
> = {
  orientation: "vertical",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
  grain: "hour",
  startTime: "",
  endTime: "",
  dataSource: "timeseries",
  showLegend: false,
  showGrid: true,
  smooth: true,
  showComparison: false,
  showDataLabels: false,
  showPoints: false,
  lineStyle: "solid",
  lineWidth: 2,
  legendPosition: "top",
  palette: "lagoon",
  seriesColors: {},
  xAxisLabelMode: "auto",
  xAxisLabelAngle: 0,
  barRadius: 6,
  barGap: 12,
  donutLabelMode: "name_percent",
  donutLabelPosition: "outside",
  donutInnerRadius: 55,
  donutOuterRadius: 85,
  donutSlicePadding: 2,
  kpiDeltaMode: "percent",
  kpiValueMode: "current",
  kpiSecondaryValue: "none",
  kpiDeltaBasis: "previous",
  kpiShowDelta: true,
  kpiDeltaStyle: "badge",
  kpiShowLabel: true,
  kpiAlignment: "left",
  kpiValueSize: "lg",
  groupBy: [],
  filters: [],
  notes: "",
}

export function inferMetricFormat(unit?: string | null) {
  if (!unit) {
    return "number" as const
  }
  const normalized = unit.toLowerCase()
  if (normalized === "$" || normalized === "usd") {
    return "currency" as const
  }
  if (normalized === "%") {
    return "percent" as const
  }
  if (normalized === "ms") {
    return "ms" as const
  }
  return "count" as const
}

export function getPalette(paletteId: string) {
  return paletteOptions.find((palette) => palette.id === paletteId) ?? paletteOptions[0]
}

export function formatMetricValue(value: number, metric: MetricDefinition) {
  if (metric.format === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value)
  }
  if (metric.format === "percent") {
    return new Intl.NumberFormat("en-US", {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(value / 100)
  }
  if (metric.format === "ms") {
    return `${Math.round(value)} ms`
  }
  const decimals =
    metric.decimals ??
    (metric.format === "count" || metric.format === "number" ? 0 : 1)
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatDelta(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`
}
