"use client"

import { useEffect, useMemo, useState } from "react"

import {
  fetchAvailability,
  fetchAggregate,
  fetchLatest,
  fetchTimeseries,
} from "./api"
import { getTileDefinition } from "./tiles/registry"
import type { TileRangeRequirement } from "./tiles/types"
import type {
  AggregateGroup,
  ChartDatum,
  Filter,
  Grain,
  MetricDefinition,
  MetricKey,
  SeriesDefinition,
  SeriesPoint,
  TileConfig,
} from "./types"

type TileSummary = {
  current: number
  change: number
  changePct: number
}

type TileSeriesData = {
  metrics: MetricDefinition[]
  primaryMetric: MetricDefinition
  series: SeriesDefinition[]
  chartData: ChartDatum[]
  xKey: string
  aggregates: AggregateGroup[]
  summary: TileSummary | null
}

type TileDataStatus = "loading" | "live" | "error"

type TileDataState = {
  status: TileDataStatus
  data: TileSeriesData
  error?: string
}

const TILE_DATA_CACHE_VERSION = 1
const TILE_DATA_CACHE_PREFIX = "metric-killer:tile-data:v1:"

type TileDataCacheRecord = {
  version: number
  updatedAt: string
  data: TileSeriesData
}

function buildTileCacheKey(requestKey: string) {
  return `${TILE_DATA_CACHE_PREFIX}${encodeURIComponent(requestKey)}`
}

function readTileDataCache(requestKey: string): TileSeriesData | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const raw = window.localStorage.getItem(buildTileCacheKey(requestKey))
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as TileDataCacheRecord
    if (parsed?.version !== TILE_DATA_CACHE_VERSION || !parsed.data) {
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

function writeTileDataCache(requestKey: string, data: TileSeriesData) {
  if (typeof window === "undefined") {
    return
  }
  try {
    const payload: TileDataCacheRecord = {
      version: TILE_DATA_CACHE_VERSION,
      updatedAt: new Date().toISOString(),
      data,
    }
    window.localStorage.setItem(
      buildTileCacheKey(requestKey),
      JSON.stringify(payload)
    )
  } catch {
    // Ignore storage failures to avoid breaking the UI.
  }
}

const dateFormatsShort: Record<Grain, Intl.DateTimeFormatOptions> = {
  "30m": { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" },
  hour: { month: "short", day: "2-digit", hour: "2-digit" },
  day: { month: "short", day: "2-digit" },
  week: { month: "short", day: "2-digit" },
  biweek: { month: "short", day: "2-digit" },
  month: { month: "short" },
  quarter: { month: "short", year: "numeric" },
}

const dateFormatsFull: Record<Grain, Intl.DateTimeFormatOptions> = {
  "30m": {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
  },
  hour: { month: "short", day: "2-digit", hour: "2-digit", year: "numeric" },
  day: { month: "short", day: "2-digit", year: "numeric" },
  week: { month: "short", day: "2-digit", year: "numeric" },
  biweek: { month: "short", day: "2-digit", year: "numeric" },
  month: { month: "short", year: "numeric" },
  quarter: { month: "short", year: "numeric" },
}

const DEFAULT_METRIC: MetricDefinition = {
  key: "metric",
  label: "Metric",
  description: "Metric",
  unit: "",
  format: "number",
}

function formatPeriodLabel(
  value: string,
  grain: Grain,
  mode: TileConfig["xAxisLabelMode"],
  includeYear: boolean
) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  if (mode === "short") {
    return new Intl.DateTimeFormat("en-US", dateFormatsShort[grain]).format(date)
  }
  if (mode === "full") {
    return new Intl.DateTimeFormat("en-US", dateFormatsFull[grain]).format(date)
  }
  const formatOptions = includeYear ? dateFormatsFull[grain] : dateFormatsShort[grain]
  return new Intl.DateTimeFormat("en-US", formatOptions).format(date)
}

function parseIsoDate(value?: string | null) {
  if (!value) {
    return undefined
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return date
}

function clampDate(value: Date, minDate?: Date, maxDate?: Date) {
  if (minDate && value < minDate) {
    return new Date(minDate)
  }
  if (maxDate && value > maxDate) {
    return new Date(maxDate)
  }
  return value
}

async function resolveTimeRange(
  tile: TileConfig,
  rangeRequirement: TileRangeRequirement
) {
  const startDate = parseIsoDate(tile.startTime)
  const endDate = parseIsoDate(tile.endTime)
  if (startDate && endDate) {
    return { startTime: tile.startTime, endTime: tile.endTime }
  }

  if (rangeRequirement === "optional" && !startDate && !endDate) {
    return null
  }

  const availability = await fetchAvailability(tile.apiBaseUrl, tile)
  const minDate = parseIsoDate(availability.min_time_start_ts)
  const maxDate = parseIsoDate(availability.max_time_start_ts)
  const resolvedStart = startDate ?? minDate
  const resolvedEnd = endDate ?? maxDate

  if (!resolvedStart || !resolvedEnd) {
    return null
  }

  const clampedStart = clampDate(resolvedStart, minDate, maxDate)
  const clampedEnd = clampDate(resolvedEnd, minDate, maxDate)
  return {
    startTime: clampedStart.toISOString(),
    endTime: clampedEnd.toISOString(),
  }
}

function buildFiltersKey(filters: Filter[]) {
  return filters
    .filter((filter) => filter.dimension && filter.values.length)
    .map((filter) => `${filter.dimension}:${filter.values.join(",")}`)
    .join("|")
}

function fallbackMetric(metricKey: string): MetricDefinition {
  return { ...DEFAULT_METRIC, key: metricKey, label: metricKey }
}

function getMetricDefinition(
  metricsByKey: Map<MetricKey, MetricDefinition>,
  metricKey: MetricKey
) {
  return metricsByKey.get(metricKey) ?? fallbackMetric(metricKey)
}

function buildSeriesKey(metricKey: string, dimensions: Record<string, string>) {
  const parts = [metricKey]
  Object.entries(dimensions).forEach(([key, value]) => {
    parts.push(`${key}=${value}`)
  })
  return parts.map((part) => encodeURIComponent(part)).join("|")
}

function buildSeriesLabel(
  metric: MetricDefinition,
  dimensions: Record<string, string>,
  groupBy: string[]
) {
  const useKeys = groupBy.length > 1
  const dimensionValues = groupBy
    .map((key) => {
      const value = dimensions[key]
      if (!value || !value.trim()) {
        return null
      }
      return useKeys ? `${key}: ${value}` : value
    })
    .filter((value): value is string => Boolean(value))
  if (!dimensionValues.length) {
    return metric.label
  }
  return `${metric.label} • ${dimensionValues.join(" / ")}`
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

function buildCategorySeries(
  aggregates: AggregateGroup[],
  groupBy: string[],
  metricKey: MetricKey
) {
  const categories = new Map<string, Record<string, string>>()
  aggregates.forEach((group) => {
    if (group.metricKey !== metricKey) {
      return
    }
    const label = buildCategoryLabel(group.dimensions, groupBy)
    if (!categories.has(label)) {
      categories.set(label, group.dimensions)
    }
  })
  return Array.from(categories.entries())
    .sort(([labelA], [labelB]) => labelA.localeCompare(labelB))
    .map(([label, dimensions]) => ({
      key: label,
      label,
      metricKey,
      dimensions,
    }))
}

function createEmptyData(metrics: MetricDefinition[]): TileSeriesData {
  const primaryMetric = metrics[0] ?? DEFAULT_METRIC
  return {
    metrics,
    primaryMetric,
    series: [],
    chartData: [],
    xKey: "period",
    aggregates: [],
    summary: null,
  }
}

function buildTimeseriesData(
  tile: TileConfig,
  metricsByKey: Map<MetricKey, MetricDefinition>,
  series: Array<{ metric_key: string; dimensions: Record<string, string>; points: SeriesPoint[] }>
): TileSeriesData {
  const metrics = tile.metricKeys.map((key) => getMetricDefinition(metricsByKey, key))
  const primaryMetric = metrics[0] ?? DEFAULT_METRIC
  const seriesDefinitions: SeriesDefinition[] = []
  const seriesOrder = new Map<string, number>()

  tile.metricKeys.forEach((metricKey, index) => {
    seriesOrder.set(metricKey, index)
  })

  const rowsByTime = new Map<string, ChartDatum & { time: string }>()

  series.forEach((entry) => {
    const metric = getMetricDefinition(metricsByKey, entry.metric_key)
    const seriesKey = buildSeriesKey(entry.metric_key, entry.dimensions)
    const label = buildSeriesLabel(metric, entry.dimensions, tile.groupBy)

    seriesDefinitions.push({
      key: seriesKey,
      label,
      metricKey: entry.metric_key,
      dimensions: entry.dimensions,
    })

    entry.points.forEach((point) => {
      const timeKey = point.time_start_ts
      const row = rowsByTime.get(timeKey) ?? {
        time: timeKey,
      }
      row[seriesKey] = Number(point.value ?? 0)
      rowsByTime.set(timeKey, row)
    })
  })

  const timeKeys = Array.from(rowsByTime.keys())
  const yearSet = new Set(
    timeKeys
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => date.getFullYear())
  )
  const includeYear =
    tile.xAxisLabelMode === "full" ||
    (tile.xAxisLabelMode === "auto" && yearSet.size > 1)

  let chartData: ChartDatum[] = Array.from(rowsByTime.values())
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    .map((row) => {
      const { time, ...rest } = row
      return {
        ...rest,
        time,
        period: formatPeriodLabel(time, tile.grain, tile.xAxisLabelMode, includeYear),
      }
    })

  seriesDefinitions.sort((a, b) => {
    const metricOrderA = seriesOrder.get(a.metricKey) ?? 0
    const metricOrderB = seriesOrder.get(b.metricKey) ?? 0
    if (metricOrderA !== metricOrderB) {
      return metricOrderA - metricOrderB
    }
    const dimsA = tile.groupBy.map((key) => a.dimensions[key] ?? "").join("|")
    const dimsB = tile.groupBy.map((key) => b.dimensions[key] ?? "").join("|")
    return dimsA.localeCompare(dimsB)
  })

  let summary: TileSummary | null = null
  if (seriesDefinitions.length === 1 && chartData.length) {
    const seriesKey = seriesDefinitions[0].key
    const values = chartData.map((row) => {
      const value = Number(row[seriesKey] ?? 0)
      return Number.isFinite(value) ? value : 0
    })
    chartData = chartData.map((row, index) => ({
      ...row,
      comparison: values[index - 1] ?? values[index] ?? 0,
    }))
    const current = values[values.length - 1] ?? 0
    const previous = values[values.length - 2] ?? current
    const change = current - previous
    const changePct = previous ? (change / previous) * 100 : 0
    summary = { current, change, changePct }
  }

  return {
    metrics,
    primaryMetric,
    series: seriesDefinitions,
    chartData,
    xKey: "period",
    aggregates: [],
    summary,
  }
}

function buildAggregateData(
  tile: TileConfig,
  metricsByKey: Map<MetricKey, MetricDefinition>,
  groups: Array<{ metric_key: string; dimensions: Record<string, string>; value: number }>
): TileSeriesData {
  const metrics = tile.metricKeys.map((key) => getMetricDefinition(metricsByKey, key))
  const primaryMetric = metrics[0] ?? DEFAULT_METRIC
  const seriesDefinitions: SeriesDefinition[] = metrics.map((metric) => ({
    key: buildSeriesKey(metric.key, {}),
    label: metric.label,
    metricKey: metric.key,
    dimensions: {},
  }))

  const seriesKeyByMetric = new Map(
    seriesDefinitions.map((series) => [series.metricKey, series.key])
  )
  const aggregates: AggregateGroup[] = groups.map((group) => ({
    metricKey: group.metric_key,
    dimensions: group.dimensions,
    value: Number(group.value ?? 0),
  }))

  const rowsByCategory = new Map<string, ChartDatum>()
  aggregates.forEach((group) => {
    const category = buildCategoryLabel(group.dimensions, tile.groupBy)
    const row = rowsByCategory.get(category) ?? { category }
    const seriesKey = seriesKeyByMetric.get(group.metricKey)
    if (seriesKey) {
      row[seriesKey] = group.value
    }
    rowsByCategory.set(category, row)
  })

  const chartData = Array.from(rowsByCategory.values()).sort((a, b) =>
    String(a.category).localeCompare(String(b.category))
  )

  let summary: TileSummary | null = null
  if (tile.metricKeys.length === 1) {
    const total = aggregates.reduce((acc, group) => acc + group.value, 0)
    summary = { current: total, change: 0, changePct: 0 }
  }

  return {
    metrics,
    primaryMetric,
    series: seriesDefinitions,
    chartData,
    xKey: "category",
    aggregates,
    summary,
  }
}

function buildLatestData(metric: MetricDefinition, value: number | null): TileSeriesData {
  const safeValue = value ?? 0
  return {
    metrics: [metric],
    primaryMetric: metric,
    series: [
      {
        key: buildSeriesKey(metric.key, {}),
        label: metric.label,
        metricKey: metric.key,
        dimensions: {},
      },
    ],
    chartData: [],
    xKey: "period",
    aggregates: [],
    summary: { current: safeValue, change: 0, changePct: 0 },
  }
}

export function useTileData(
  tile: TileConfig,
  metricsByKey: Map<MetricKey, MetricDefinition>
): TileDataState {
  const tileDefinition = useMemo(
    () => getTileDefinition(tile.vizType),
    [tile.vizType]
  )
  const metricKeys = tile.metricKeys.length ? tile.metricKeys : ["metric"]
  const metrics = useMemo(
    () => metricKeys.map((key) => getMetricDefinition(metricsByKey, key)),
    [metricKeys.join("|"), metricsByKey]
  )
  const primaryMetric = metrics[0] ?? DEFAULT_METRIC

  const filtersKey = useMemo(() => buildFiltersKey(tile.filters), [tile.filters])
  const requestKey = useMemo(
    () =>
      [
        tile.apiBaseUrl,
        tile.vizType,
        tile.dataSource,
        tile.grain,
        tile.startTime,
        tile.endTime,
        tile.metricKeys.join(","),
        tile.groupBy.join(","),
        filtersKey,
      ].join("|"),
    [
      tile.apiBaseUrl,
      tile.vizType,
      tile.dataSource,
      tile.grain,
      tile.startTime,
      tile.endTime,
      tile.metricKeys.join(","),
      tile.groupBy.join(","),
      filtersKey,
    ]
  )

  const cachedData = useMemo(() => readTileDataCache(requestKey), [requestKey])

  const [state, setState] = useState<TileDataState>(() => ({
    status: cachedData ? "live" : "loading",
    data: cachedData ?? createEmptyData(metrics),
    error: undefined,
  }))

  useEffect(() => {
    let isActive = true
    setState((prev) => ({
      status: cachedData ? "live" : "loading",
      data:
        cachedData ?? (prev.data.metrics.length ? prev.data : createEmptyData(metrics)),
      error: undefined,
    }))

    const load = async () => {
      try {
        const dataSource = tile.dataSource ?? tileDefinition.data.source
        const resolvedRange = await resolveTimeRange(tile, tileDefinition.data.range)
        const hasRange = resolvedRange !== null
        const requestTile = resolvedRange
          ? { ...tile, startTime: resolvedRange.startTime, endTime: resolvedRange.endTime }
          : tile
        if (!requestTile.metricKeys.length) {
          throw new Error("Select at least one metric.")
        }
        let data: TileSeriesData
        if (dataSource === "aggregate") {
          if (!hasRange) {
            throw new Error("Select a start and end time or use the available range.")
          }
          const response = await fetchAggregate(tile.apiBaseUrl, requestTile)
          data = buildAggregateData(requestTile, metricsByKey, response.groups)
        } else if (dataSource === "timeseries") {
          if (!hasRange) {
            throw new Error("Select a start and end time or use the available range.")
          }
          const response = await fetchTimeseries(tile.apiBaseUrl, requestTile)
          data = buildTimeseriesData(requestTile, metricsByKey, response.series)
        } else {
          if (!hasRange) {
            const latest = await fetchLatest(tile.apiBaseUrl, tile)
            data = buildLatestData(primaryMetric, latest.value)
          } else {
            const response = await fetchTimeseries(tile.apiBaseUrl, requestTile)
            if (response.series.length === 0) {
              const latest = await fetchLatest(tile.apiBaseUrl, tile)
              data = buildLatestData(primaryMetric, latest.value)
            } else {
              data = buildTimeseriesData(requestTile, metricsByKey, response.series)
            }
          }
        }
        if (tile.vizType === "donut" && dataSource === "aggregate") {
          data = {
            ...data,
            series: buildCategorySeries(
              data.aggregates,
              requestTile.groupBy,
              data.primaryMetric.key
            ),
          }
        }
        if (!isActive) {
          return
        }
        writeTileDataCache(requestKey, data)
        setState({ status: "live", data })
      } catch (error) {
        if (!isActive) {
          return
        }
        const message =
          error instanceof Error ? error.message : "Failed to load live data."
        setState((prev) => ({ ...prev, status: "error", error: message }))
      }
    }

    load()
    return () => {
      isActive = false
    }
  }, [requestKey, cachedData, metrics, metricsByKey, primaryMetric, tileDefinition])

  const resolvedState = useMemo(() => {
    const { data } = state
    if (!data.chartData.length || data.xKey !== "period") {
      return state
    }
    const timeValues = data.chartData
      .map((row) => String(row.time ?? ""))
      .filter((value) => value)
    if (!timeValues.length) {
      return state
    }
    const yearSet = new Set(
      timeValues
        .map((value) => new Date(value))
        .filter((date) => !Number.isNaN(date.getTime()))
        .map((date) => date.getFullYear())
    )
    const includeYear =
      tile.xAxisLabelMode === "full" ||
      (tile.xAxisLabelMode === "auto" && yearSet.size > 1)
    const chartData = data.chartData.map((row) => {
      const time = String(row.time ?? "")
      if (!time) {
        return row
      }
      return {
        ...row,
        period: formatPeriodLabel(time, tile.grain, tile.xAxisLabelMode, includeYear),
      }
    })
    return { ...state, data: { ...data, chartData } }
  }, [state, tile.grain, tile.xAxisLabelMode])

  return resolvedState
}
