import { inferMetricFormat, tileDefaults } from "../data"
import type {
  DashboardConfig,
  DimensionDefinition,
  MetricDefinition,
  TileConfig,
  VizType,
} from "../types"
import { getTileDefinition } from "../tiles/registry"
import type { TileDefinition } from "../tiles/types"
import type { DimensionCatalogItem, MetricCatalogItem } from "../api"

export const gridBreakpoints = { lg: 1200, md: 996, sm: 768, xs: 560, xxs: 0 }
export const gridCols = { lg: 12, md: 10, sm: 6, xs: 1, xxs: 1 }
export type BreakpointKey = keyof typeof gridBreakpoints

type LayoutByBreakpoint = Partial<Record<BreakpointKey, TileConfig["layout"]>>

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
  const definition = getTileDefinition(tile.vizType) as TileDefinition<TileConfig>
  if (definition.getMinSize) {
    return definition.getMinSize(tile)
  }
  return { minW: definition.minSize.w, minH: definition.minSize.h }
}

function normalizeLayout(value: unknown): TileConfig["layout"] | null {
  if (!value || typeof value !== "object") {
    return null
  }
  const { x, y, w, h } = value as {
    x?: unknown
    y?: unknown
    w?: unknown
    h?: unknown
  }
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof w !== "number" ||
    typeof h !== "number"
  ) {
    return null
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return null
  }
  return { x, y, w, h }
}

function normalizeLayouts(
  value: unknown,
  fallback: TileConfig["layout"]
): LayoutByBreakpoint {
  const layouts: LayoutByBreakpoint = {}
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    ;(Object.keys(gridBreakpoints) as BreakpointKey[]).forEach((key) => {
      const layout = normalizeLayout(record[key])
      if (layout) {
        layouts[key] = layout
      }
    })
  }
  if (!layouts.lg) {
    layouts.lg = fallback
  }
  return layouts
}

export function resolveTileLayout(tile: TileConfig, breakpoint: BreakpointKey) {
  return tile.layouts?.[breakpoint] ?? tile.layout
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
  const vizType = sanitizedTile.vizType ?? "line"
  const definition = getTileDefinition(vizType)
  const fallbackLayout =
    normalizeLayout(sanitizedTile.layout) ?? {
      x: 0,
      y: 0,
      w: definition.minSize.w,
      h: definition.minSize.h,
    }
  const normalizedLayouts = normalizeLayouts(sanitizedTile.layouts, fallbackLayout)
  const layoutForTile = normalizedLayouts.lg ?? fallbackLayout
  const metricKeys = Array.isArray(sanitizedTile.metricKeys)
    ? sanitizedTile.metricKeys
    : []
  const uniqueMetricKeys = Array.from(new Set(metricKeys))
  const groupBy = Array.isArray(sanitizedTile.groupBy) ? sanitizedTile.groupBy : []
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
    layout: layoutForTile,
    layouts: normalizedLayouts,
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
  const buildItem = (
    tile: TileConfig,
    cols: number,
    breakpoint: BreakpointKey,
    layoutOverride?: TileConfig["layout"]
  ) => {
    const baseLayout = layoutOverride ?? resolveTileLayout(tile, breakpoint)
    const minSize = getTileMinSize(tile)
    const width = Math.min(Math.max(baseLayout.w, minSize.minW), cols)
    const height = Math.max(baseLayout.h, minSize.minH)
    const maxX = Math.max(0, cols - width)
    const x = Math.min(baseLayout.x, maxX)
    return {
      i: tile.id,
      x,
      y: baseLayout.y,
      w: width,
      h: height,
      minW: Math.min(minSize.minW, cols),
      minH: minSize.minH,
    }
  }

  const buildForCols = (cols: number, breakpoint: BreakpointKey) =>
    tiles.map((tile) => buildItem(tile, cols, breakpoint))

  const buildPackedForCols = (cols: number, breakpoint: BreakpointKey) => {
    const ordered = [...tiles].sort((a, b) => {
      if (a.layout.y !== b.layout.y) {
        return a.layout.y - b.layout.y
      }
      if (a.layout.x !== b.layout.x) {
        return a.layout.x - b.layout.x
      }
      return a.id.localeCompare(b.id)
    })
    const packed = packTiles(
      ordered.map((tile) => ({
        ...tile,
        layout: resolveTileLayout(tile, breakpoint),
      })),
      cols
    )
    return packed.map((tile) => buildItem(tile, cols, breakpoint, tile.layout))
  }
  const hasLayoutFor = (breakpoint: BreakpointKey) =>
    tiles.some((tile) => tile.layouts?.[breakpoint])
  return {
    lg: buildForCols(gridCols.lg, "lg"),
    md: buildForCols(gridCols.md, "md"),
    sm: buildForCols(gridCols.sm, "sm"),
    xs: hasLayoutFor("xs")
      ? buildForCols(gridCols.xs, "xs")
      : buildPackedForCols(gridCols.xs, "xs"),
    xxs: hasLayoutFor("xxs")
      ? buildForCols(gridCols.xxs, "xxs")
      : buildPackedForCols(gridCols.xxs, "xxs"),
  }
}
