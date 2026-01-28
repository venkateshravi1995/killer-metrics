import type {
  DimensionKey,
  Filter,
  Grain,
  MetricKey,
  TileDataSource,
  TileLayout,
  VizType,
} from "./base-types"

export type BaseTileConfig<TVisuals = Record<string, unknown>> = {
  id: string
  title: string
  description: string
  metricKeys: MetricKey[]
  vizType: VizType
  layout: TileLayout
  apiBaseUrl: string
  grain: Grain
  startTime: string
  endTime: string
  dataSource: TileDataSource
  groupBy: DimensionKey[]
  filters: Filter[]
  notes: string
  visuals: TVisuals
}

import type { AreaTileConfig } from "./tiles/area/config"
import type { BarTileConfig } from "./tiles/bar/config"
import type { DonutTileConfig } from "./tiles/donut/config"
import type { KpiTileConfig } from "./tiles/kpi/config"
import type { LineTileConfig } from "./tiles/line/config"
import type { TableTileConfig } from "./tiles/table/config"

export type TileConfig =
  | LineTileConfig
  | AreaTileConfig
  | BarTileConfig
  | DonutTileConfig
  | TableTileConfig
  | KpiTileConfig

export type DashboardConfig = {
  tiles: TileConfig[]
}
