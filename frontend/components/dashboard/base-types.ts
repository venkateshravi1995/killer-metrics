export type MetricKey = string

export type VizType = "line" | "bar" | "area" | "donut" | "kpi" | "table"

export type TileDataSource = "timeseries" | "aggregate" | "kpi"

export type Orientation = "vertical" | "horizontal"

export type LegendPosition = "top" | "bottom" | "left" | "right"

export type AxisLabelMode = "auto" | "short" | "full"

export type DimensionKey = string

export type Grain =
  | "30m"
  | "hour"
  | "day"
  | "week"
  | "biweek"
  | "month"
  | "quarter"

export type Filter = {
  id: string
  dimension: DimensionKey
  dimensionId: number
  values: string[]
  valueIds: number[]
}

export type TileLayout = {
  x: number
  y: number
  w: number
  h: number
}

export type MetricDefinition = {
  key: MetricKey
  label: string
  description?: string | null
  unit?: string | null
  format: "currency" | "percent" | "count" | "ms" | "number"
  decimals?: number
}

export type DimensionDefinition = {
  id: number
  key: DimensionKey
  label: string
  description?: string | null
}

export type SeriesPoint = {
  time_start_ts: string
  value: number
}

export type SeriesDefinition = {
  key: string
  label: string
  metricKey: MetricKey
  dimensions: Record<string, string>
}

export type ChartDatum = {
  [key: string]: number | string
}

export type AggregateGroup = {
  metricKey: MetricKey
  dimensions: Record<string, string>
  value: number
}

export type PaletteOption = {
  id: string
  label: string
  colors: string[]
}
