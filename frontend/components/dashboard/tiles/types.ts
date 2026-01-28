import type { ReactElement } from "react"
import type {
  AggregateGroup,
  ChartDatum,
  DimensionDefinition,
  Filter,
  MetricDefinition,
  SeriesDefinition,
  TileConfig,
  TileDataSource,
  VizType,
} from "../types"
import type { AvailabilityResponse, DimensionValueItem } from "../api"

export type TileRenderProps<TConfig extends TileConfig = TileConfig> = {
  tile: TConfig
  metrics: MetricDefinition[]
  primaryMetric: MetricDefinition
  chartData: ChartDatum[]
  series: SeriesDefinition[]
  xKey: string
  aggregates: AggregateGroup[]
  groupByLabels: string[]
  current: number
  change: number
  changePct: number
  accentColor: string
}

export type TileRangeRequirement = "required" | "optional"

export type TileVisualOptions = {
  palette?: boolean
  seriesColors?: boolean
  lineWidth?: boolean
  showLegend?: boolean
  legendPosition?: boolean
  showGrid?: boolean
  smooth?: boolean
  showComparison?: boolean
  orientation?: boolean
  showDataLabels?: boolean
  donutLabelMode?: boolean
  donutLabelPosition?: boolean
  donutInnerRadius?: boolean
  showPoints?: boolean
  lineStyle?: boolean
  axisLabels?: boolean
  barRadius?: boolean
  barGap?: boolean
  donutOuterRadius?: boolean
  donutSlicePadding?: boolean
  kpiDeltaMode?: boolean
  kpiValueMode?: boolean
  kpiSecondaryValue?: boolean
  kpiDeltaBasis?: boolean
  kpiShowDelta?: boolean
  kpiDeltaStyle?: boolean
  kpiShowLabel?: boolean
  kpiAlignment?: boolean
  kpiValueSize?: boolean
}

export type TileDefinition<TConfig extends TileConfig = TileConfig> = {
  type: TConfig["vizType"]
  label: string
  description: string
  minSize: { w: number; h: number }
  data: {
    source: TileDataSource
    range: TileRangeRequirement
    supportsGroupBy: boolean
    maxMetrics?: number
    allowedSources?: TileDataSource[]
  }
  api: {
    method: "GET" | "POST"
    endpoint: string
    description: string
  }
  visualOptions: TileVisualOptions
  visualDefaults: TConfig["visuals"]
  render: (props: TileRenderProps<TConfig>) => ReactElement
  getMinSize?: (tile: TConfig) => { minW: number; minH: number }
  configurator?: TileConfiguratorComponent<TConfig>
}

export type TileConfiguratorProps<TConfig extends TileConfig = TileConfig> = {
  tile: TConfig
  onUpdate: (tileId: string, updates: Partial<TConfig>) => void
  metrics: MetricDefinition[]
  dimensions: DimensionDefinition[]
  series: SeriesDefinition[]
  tileDefinition: TileDefinition<TConfig>
  tileDefinitions: TileDefinition[]
  activeTab: "data" | "visuals"
  onTabChange: (tab: "data" | "visuals") => void
  availability: AvailabilityResponse | null
  availabilityStatus: "idle" | "loading" | "ready" | "error"
  availabilityError: string | null
  dimensionValues: Record<string, DimensionValueItem[]>
  dimensionValuesStatus: Record<string, "loading" | "ready" | "error">
  addFilter: () => void
  updateFilter: (filterId: string, updates: Partial<Filter>) => void
  removeFilter: (filterId: string) => void
  toggleMetric: (metricKey: string, enabled: boolean) => void
  toggleGroupBy: (dimensionKey: string, enabled: boolean) => void
  updateSeriesColor: (seriesKey: string, color: string | null) => void
  clearSeriesColors: () => void
}

export type TileConfiguratorComponent<TConfig extends TileConfig = TileConfig> = (
  props: TileConfiguratorProps<TConfig>
) => ReactElement
