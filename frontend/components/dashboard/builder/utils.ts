import { inferMetricFormat, tileDefaults } from "../data"
import type {
  DashboardConfig,
  DimensionDefinition,
  Filter as TileFilter,
  MetricDefinition,
  TileConfig,
} from "../types"
import { getTileDefinition } from "../tiles/registry"
import type { DimensionCatalogItem, DashboardSummary, MetricCatalogItem } from "../api"

export const gridBreakpoints = { lg: 1200, md: 996, sm: 768, xs: 560, xxs: 0 }
export const gridCols = { lg: 12, md: 10, sm: 6, xs: 1, xxs: 1 }
export type BreakpointKey = keyof typeof gridBreakpoints

let runtimeId = 0
const DASHBOARD_CACHE_VERSION = 1
const DASHBOARD_CACHE_KEY = "metric-killer:dashboard-cache:v1"

export type DashboardCache = {
  version: number
  updatedAt: string
  activeDashboardId: string | null
  dashboards: DashboardSummary[]
  current: {
    id: string
    name: string
    description: string
    tiles: TileConfig[]
    selectedTileId: string | null
    editMode: boolean
    hasDraft: boolean
  } | null
}

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  runtimeId += 1
  return `${prefix}-${runtimeId}`
}

function createSeedId(index: number) {
  return `tile-seed-${index + 1}`
}

export function readDashboardCache(): DashboardCache | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const raw = window.localStorage.getItem(DASHBOARD_CACHE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as DashboardCache
    if (parsed?.version !== DASHBOARD_CACHE_VERSION) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeDashboardCache(cache: DashboardCache) {
  if (typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Ignore storage failures to avoid breaking the UI.
  }
}

export function getTileMinSize(tile: TileConfig) {
  const definition = getTileDefinition(tile.vizType)
  if (definition.getMinSize) {
    return definition.getMinSize(tile)
  }
  return { minW: definition.minSize.w, minH: definition.minSize.h }
}

export function applyMinSize(tile: TileConfig, cols: number) {
  const { minW, minH } = getTileMinSize(tile)
  const width = Math.min(Math.max(tile.layout.w, minW), cols)
  const height = Math.max(tile.layout.h, minH)
  return {
    ...tile,
    layout: { ...tile.layout, w: width, h: height },
  }
}

export function packTiles(tiles: TileConfig[], cols: number) {
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0
  return tiles.map((tile) => {
    const sizedTile = applyMinSize(tile, cols)
    const width = sizedTile.layout.w
    const height = sizedTile.layout.h
    if (cursorX + width > cols) {
      cursorX = 0
      cursorY += rowHeight + 1
      rowHeight = 0
    }
    const next = {
      ...sizedTile,
      layout: { ...sizedTile.layout, x: cursorX, y: cursorY, w: width, h: height },
    }
    cursorX += width
    rowHeight = Math.max(rowHeight, height)
    return next
  })
}

export function createTileConfig(
  metric: MetricDefinition,
  layout: { x: number; y: number; w: number; h: number },
  id: string
): TileConfig {
  return {
    id,
    title: metric.label,
    description: metric.description ?? "",
    metricKeys: [metric.key],
    vizType: "line",
    layout,
    ...tileDefaults,
    groupBy: [...tileDefaults.groupBy],
    filters: [...tileDefaults.filters],
    seriesColors: { ...tileDefaults.seriesColors },
  }
}

export function seedTiles(metrics: MetricDefinition[], cols = gridCols.lg) {
  if (!metrics.length) {
    return []
  }
  const seeded = [
    createTileConfig(
      metrics[0],
      { x: 0, y: 0, w: 6, h: 5 },
      createSeedId(0)
    ),
  ]
  return packTiles(seeded, cols)
}

export function extractTilesFromConfig(
  config: DashboardConfig | Record<string, unknown> | TileConfig[] | null | undefined
) {
  if (Array.isArray(config)) {
    return (config as TileConfig[]).map((tile) => normalizeTileConfig(tile))
  }
  if (config && typeof config === "object") {
    const maybeConfig = config as DashboardConfig
    if (Array.isArray(maybeConfig.tiles)) {
      return maybeConfig.tiles.map((tile) => normalizeTileConfig(tile))
    }
  }
  return []
}

export function normalizeTileConfig(tile: TileConfig) {
  const sanitizedTile = { ...tile } as TileConfig & { rules?: unknown }
  if ("rules" in sanitizedTile) {
    delete sanitizedTile.rules
  }
  const legacy = sanitizedTile as TileConfig & {
    metricKey?: string
    breakdownDimension?: string
    donutLegendPosition?: TileConfig["legendPosition"]
  }
  const metricKeys =
    sanitizedTile.metricKeys?.length
      ? sanitizedTile.metricKeys
      : legacy.metricKey
        ? [legacy.metricKey]
        : []
  const uniqueMetricKeys = Array.from(new Set(metricKeys))
  const groupBy =
    sanitizedTile.groupBy?.length
      ? sanitizedTile.groupBy
      : legacy.breakdownDimension
        ? [legacy.breakdownDimension]
        : []
  const definition = getTileDefinition(sanitizedTile.vizType)
  const allowedSources = definition.data.allowedSources ?? [definition.data.source]
  const dataSource = allowedSources.includes(sanitizedTile.dataSource)
    ? sanitizedTile.dataSource
    : sanitizedTile.dataSource ?? allowedSources[0]
  const maxMetrics = definition.data.maxMetrics
  const trimmedMetricKeys =
    typeof maxMetrics === "number" ? uniqueMetricKeys.slice(0, maxMetrics) : uniqueMetricKeys
  const normalizedGroupBy = definition.data.supportsGroupBy ? groupBy : []
  const legendPosition =
    sanitizedTile.legendPosition ?? legacy.donutLegendPosition ?? tileDefaults.legendPosition
  const seriesColors = sanitizedTile.seriesColors ?? tileDefaults.seriesColors
  const xAxisLabelMode = sanitizedTile.xAxisLabelMode ?? tileDefaults.xAxisLabelMode
  const xAxisLabelAngle =
    typeof sanitizedTile.xAxisLabelAngle === "number"
      ? sanitizedTile.xAxisLabelAngle
      : tileDefaults.xAxisLabelAngle
  const kpiValueMode = sanitizedTile.kpiValueMode ?? tileDefaults.kpiValueMode
  const kpiSecondaryValue =
    sanitizedTile.kpiSecondaryValue ?? tileDefaults.kpiSecondaryValue
  const kpiDeltaMode = sanitizedTile.kpiDeltaMode ?? tileDefaults.kpiDeltaMode
  const kpiDeltaBasis = sanitizedTile.kpiDeltaBasis ?? tileDefaults.kpiDeltaBasis
  const kpiShowDelta = sanitizedTile.kpiShowDelta ?? tileDefaults.kpiShowDelta
  const kpiDeltaStyle = sanitizedTile.kpiDeltaStyle ?? tileDefaults.kpiDeltaStyle
  const kpiShowLabel = sanitizedTile.kpiShowLabel ?? tileDefaults.kpiShowLabel
  const kpiAlignment = sanitizedTile.kpiAlignment ?? tileDefaults.kpiAlignment
  const kpiValueSize = sanitizedTile.kpiValueSize ?? tileDefaults.kpiValueSize
  const normalizedFilters = (sanitizedTile.filters ?? []).map((filter) => {
    const legacyFilter = filter as TileFilter & {
      value?: string
      values?: string[]
    }
    const values = Array.isArray(legacyFilter.values)
      ? legacyFilter.values
      : legacyFilter.value
        ? [legacyFilter.value]
        : []
    return { ...filter, values }
  })
  return {
    ...sanitizedTile,
    metricKeys: trimmedMetricKeys,
    groupBy: normalizedGroupBy,
    dataSource,
    legendPosition,
    seriesColors,
    xAxisLabelMode,
    xAxisLabelAngle,
    kpiValueMode,
    kpiSecondaryValue,
    kpiDeltaMode,
    kpiDeltaBasis,
    kpiShowDelta,
    kpiDeltaStyle,
    kpiShowLabel,
    kpiAlignment,
    kpiValueSize,
    filters: normalizedFilters,
  }
}

export function mapMetricDefinition(item: MetricCatalogItem): MetricDefinition {
  const format = inferMetricFormat(item.unit)
  const decimals = format === "percent" ? 2 : undefined
  return {
    key: item.metric_key,
    label: item.metric_name,
    description: item.metric_description ?? "",
    unit: item.unit ?? "",
    format,
    decimals,
  }
}

export function mapDimensionDefinition(
  item: DimensionCatalogItem
): DimensionDefinition {
  return {
    key: item.dimension_key,
    label: item.dimension_name,
    description: item.dimension_description ?? "",
  }
}

export function buildLayouts(tiles: TileConfig[]) {
  const buildForCols = (cols: number) =>
    tiles.map((tile) => {
      const minSize = getTileMinSize(tile)
      const width = Math.min(Math.max(tile.layout.w, minSize.minW), cols)
      const height = Math.max(tile.layout.h, minSize.minH)
      const maxX = Math.max(0, cols - width)
      const x = Math.min(tile.layout.x, maxX)
      return {
        i: tile.id,
        x,
        y: tile.layout.y,
        w: width,
        h: height,
        minW: Math.min(minSize.minW, cols),
        minH: minSize.minH,
      }
    })
  return {
    lg: buildForCols(gridCols.lg),
    md: buildForCols(gridCols.md),
    sm: buildForCols(gridCols.sm),
    xs: buildForCols(gridCols.xs),
    xxs: buildForCols(gridCols.xxs),
  }
}
