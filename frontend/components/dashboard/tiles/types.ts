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
import type { AvailabilityResponse } from "../api"

export type TileRenderProps = {
  tile: TileConfig
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

export type TileDefinition = {
  type: VizType
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
  render: (props: TileRenderProps) => JSX.Element
  getMinSize?: (tile: TileConfig) => { minW: number; minH: number }
  configurator?: TileConfiguratorComponent
}

export type TileConfiguratorProps = {
  tile: TileConfig
  onUpdate: (tileId: string, updates: Partial<TileConfig>) => void
  metrics: MetricDefinition[]
  dimensions: DimensionDefinition[]
  series: SeriesDefinition[]
  tileDefinition: TileDefinition
  tileDefinitions: TileDefinition[]
  activeTab: "data" | "visuals"
  onTabChange: (tab: "data" | "visuals") => void
  availability: AvailabilityResponse | null
  availabilityStatus: "idle" | "loading" | "ready" | "error"
  availabilityError: string | null
  dimensionValues: Record<string, string[]>
  dimensionValuesStatus: Record<string, "loading" | "ready" | "error">
  addFilter: () => void
  updateFilter: (filterId: string, updates: Partial<Filter>) => void
  removeFilter: (filterId: string) => void
  toggleMetric: (metricKey: string, enabled: boolean) => void
  toggleGroupBy: (dimensionKey: string, enabled: boolean) => void
  updateSeriesColor: (seriesKey: string, color: string | null) => void
  clearSeriesColors: () => void
}

export type TileConfiguratorComponent = (props: TileConfiguratorProps) => JSX.Element
