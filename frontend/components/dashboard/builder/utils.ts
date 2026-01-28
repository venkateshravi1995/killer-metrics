import { inferMetricFormat, tileDefaults } from "../data"
import type {
  DashboardConfig,
  DimensionDefinition,
  MetricDefinition,
  TileConfig,
  VizType,
} from "../types"
import { getTileDefinition } from "../tiles/registry"
import type { DimensionCatalogItem, MetricCatalogItem } from "../api"

export const gridBreakpoints = { lg: 1200, md: 996, sm: 768, xs: 560, xxs: 0 }
export const gridCols = { lg: 12, md: 10, sm: 6, xs: 1, xxs: 1 }
export type BreakpointKey = keyof typeof gridBreakpoints

let runtimeId = 0
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

function cloneVisuals<TVisuals extends Record<string, unknown>>(visuals: TVisuals) {
  const cloned = { ...visuals } as TVisuals
  if ("seriesColors" in cloned) {
    const value = (cloned as { seriesColors?: unknown }).seriesColors
    if (value && typeof value === "object" && !Array.isArray(value)) {
      ;(cloned as { seriesColors?: Record<string, string> }).seriesColors = {
        ...(value as Record<string, string>),
      }
    }
  }
  return cloned
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
  id: string,
  vizType: VizType = "line"
): TileConfig {
  const definition = getTileDefinition(vizType)
  const defaultVisuals = cloneVisuals(definition.visualDefaults)
  return {
    id,
    title: metric.label,
    description: metric.description ?? "",
    metricKeys: [metric.key],
    vizType,
    layout,
    ...tileDefaults,
    dataSource: definition.data.source,
    groupBy: [...tileDefaults.groupBy],
    filters: [...tileDefaults.filters],
    visuals: defaultVisuals,
  } as TileConfig
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

function normalizeVisuals(
  visuals: Record<string, unknown>,
  defaults: Record<string, unknown>
) {
  const next = { ...defaults, ...visuals }
  if ("seriesColors" in defaults) {
    const value = next.seriesColors
    if (value && typeof value === "object" && !Array.isArray(value)) {
      next.seriesColors = { ...(value as Record<string, string>) }
    } else {
      next.seriesColors = { ...(defaults.seriesColors as Record<string, string>) }
    }
  }
  Object.keys(defaults).forEach((key) => {
    const defaultValue = defaults[key]
    const currentValue = next[key]
    if (currentValue === undefined) {
      return
    }
    if (typeof defaultValue === "number" && typeof currentValue !== "number") {
      next[key] = defaultValue
    }
    if (typeof defaultValue === "boolean" && typeof currentValue !== "boolean") {
      next[key] = defaultValue
    }
    if (typeof defaultValue === "string" && typeof currentValue !== "string") {
      next[key] = defaultValue
    }
  })
  return next
}

export function normalizeTileConfig(tile: TileConfig): TileConfig {
  const sanitizedTile = { ...tile }
  const metricKeys = Array.isArray(sanitizedTile.metricKeys)
    ? sanitizedTile.metricKeys
    : []
  const uniqueMetricKeys = Array.from(new Set(metricKeys))
  const groupBy = Array.isArray(sanitizedTile.groupBy) ? sanitizedTile.groupBy : []
  const vizType = sanitizedTile.vizType ?? "line"
  const definition = getTileDefinition(vizType)
  const allowedSources = definition.data.allowedSources ?? [definition.data.source]
  const dataSource = allowedSources.includes(sanitizedTile.dataSource)
    ? sanitizedTile.dataSource
    : sanitizedTile.dataSource ?? allowedSources[0]
  const maxMetrics = definition.data.maxMetrics
  const trimmedMetricKeys =
    typeof maxMetrics === "number" ? uniqueMetricKeys.slice(0, maxMetrics) : uniqueMetricKeys
  const normalizedGroupBy = definition.data.supportsGroupBy ? groupBy : []
  const visualDefaults = cloneVisuals(
    definition.visualDefaults as Record<string, unknown>
  )
  const providedVisuals =
    sanitizedTile.visuals && typeof sanitizedTile.visuals === "object"
      ? sanitizedTile.visuals
      : {}
  const mergedVisuals = normalizeVisuals(providedVisuals, visualDefaults)
  const normalizedFilters = Array.isArray(sanitizedTile.filters)
    ? sanitizedTile.filters
    : []
  return {
    id: sanitizedTile.id,
    title: sanitizedTile.title ?? "Untitled",
    description: sanitizedTile.description ?? "",
    metricKeys: trimmedMetricKeys,
    vizType,
    layout: sanitizedTile.layout,
    apiBaseUrl: sanitizedTile.apiBaseUrl ?? tileDefaults.apiBaseUrl,
    grain: sanitizedTile.grain ?? tileDefaults.grain,
    startTime: sanitizedTile.startTime ?? tileDefaults.startTime,
    endTime: sanitizedTile.endTime ?? tileDefaults.endTime,
    dataSource,
    groupBy: normalizedGroupBy,
    filters: normalizedFilters,
    notes: sanitizedTile.notes ?? tileDefaults.notes,
    visuals: mergedVisuals,
  } as TileConfig
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
    id: item.dimension_id,
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
