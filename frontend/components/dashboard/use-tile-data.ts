"use client"

import { useEffect, useMemo, useState } from "react"

import {
  fetchAvailability,
  fetchAggregate,
  fetchLatest,
  fetchTimeseries,
  type AggregateResponse,
  type AvailabilityResponse,
  type LatestResponse,
  type TimeseriesResponse,
} from "./api"
import { getTileDefinition } from "./tiles/registry"
import type { TileRangeRequirement } from "./tiles/types"
import type {
  AggregateGroup,
  AxisLabelMode,
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
  lastUpdated: number | null
  isRefreshing: boolean
  error?: string
}

const CACHE_STALE_MS = 60_000
type CacheEntry<T> = {
  expiresAt: number
  value?: T
  inFlight?: Promise<T>
  lastUpdated?: number
}
const tileDataCache = new Map<string, CacheEntry<TileSeriesData>>()
const availabilityCache = new Map<string, CacheEntry<AvailabilityResponse>>()
const latestCache = new Map<string, CacheEntry<LatestResponse>>()
const timeseriesCache = new Map<string, CacheEntry<TimeseriesResponse>>()
const aggregateCache = new Map<string, CacheEntry<AggregateResponse>>()

function getCacheKey(parts: Array<string | number | undefined | null>) {
  return parts.filter((part) => part !== undefined && part !== null).join("|")
}

type CacheResult<T> = {
  value?: T
  lastUpdated?: number
  isStale: boolean
  revalidate?: Promise<T>
}

function fetchWithCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  fetcher: (signal?: AbortSignal) => Promise<T>,
  signal?: AbortSignal
): CacheResult<T> {
  const now = Date.now()
  const existing = cache.get(key)
  if (existing && existing.value) {
    const isFresh = existing.expiresAt > now
    if (isFresh) {
      return { value: existing.value, lastUpdated: existing.lastUpdated, isStale: false }
    }
    if (!existing.inFlight) {
      const inFlight = fetcher(signal)
        .then((value) => {
          cache.set(key, {
            value,
            expiresAt: Date.now() + CACHE_STALE_MS,
            lastUpdated: Date.now(),
          })
          return value
        })
        .catch((error) => {
          cache.set(key, { ...existing, inFlight: undefined })
          throw error
        })
      cache.set(key, { ...existing, inFlight })
      return {
        value: existing.value,
        lastUpdated: existing.lastUpdated,
        isStale: true,
        revalidate: inFlight,
      }
    }
    return {
      value: existing.value,
      lastUpdated: existing.lastUpdated,
      isStale: true,
      revalidate: existing.inFlight,
    }
  }

  if (existing?.inFlight) {
    return { isStale: true, revalidate: existing.inFlight }
  }
  const inFlight = fetcher(signal)
    .then((value) => {
      cache.set(key, {
        value,
        expiresAt: Date.now() + CACHE_STALE_MS,
        lastUpdated: Date.now(),
      })
      return value
    })
    .catch((error) => {
      cache.delete(key)
      throw error
    })
  cache.set(key, { expiresAt: now + CACHE_STALE_MS, inFlight })
  return { isStale: true, revalidate: inFlight }
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
  mode: AxisLabelMode,
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

function resolveAxisLabelMode(tile: TileConfig): AxisLabelMode {
  const visuals = tile.visuals as { xAxisLabelMode?: AxisLabelMode }
  return visuals.xAxisLabelMode ?? "auto"
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

function getCacheLastUpdated<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  return cache.get(key)?.lastUpdated ?? null
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
}

async function resolveTimeRange(
  tile: TileConfig,
  rangeRequirement: TileRangeRequirement,
  signal?: AbortSignal
) {
  const startDate = parseIsoDate(tile.startTime)
  const endDate = parseIsoDate(tile.endTime)
  if (startDate && endDate) {
    return { startTime: tile.startTime, endTime: tile.endTime }
  }

  if (rangeRequirement === "optional" && !startDate && !endDate) {
    return null
  }

  const availabilityKey = getCacheKey([
    "availability",
    tile.apiBaseUrl,
    tile.metricKeys[0],
    tile.grain,
    buildFiltersKey(tile.filters),
  ])
  const availabilityResult = fetchWithCache(
    availabilityCache,
    availabilityKey,
    (fetchSignal) => fetchAvailability(tile.apiBaseUrl, tile, { signal: fetchSignal }),
    signal
  )
  const availability =
    availabilityResult.value ??
    (availabilityResult.revalidate
      ? await availabilityResult.revalidate
      : undefined)
  if (!availability) {
    return null
  }
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
    .filter((filter) => filter.dimensionId && (filter.valueIds ?? []).length)
    .map((filter) => {
      const values = Array.from(new Set(filter.valueIds ?? []))
        .filter((valueId) => Number.isFinite(valueId))
        .sort((a, b) => a - b)
      return {
        dimensionId: String(filter.dimensionId),
        values,
      }
    })
    .sort((a, b) => a.dimensionId.localeCompare(b.dimensionId))
    .map((filter) => `${filter.dimensionId}:${filter.values.join(",")}`)
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
  const axisLabelMode = resolveAxisLabelMode(tile)
  const includeYear =
    axisLabelMode === "full" ||
    (axisLabelMode === "auto" && yearSet.size > 1)

  let chartData: ChartDatum[] = Array.from(rowsByTime.values())
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    .map((row) => {
      const { time, ...rest } = row
      return {
        ...rest,
        time,
        period: formatPeriodLabel(time, tile.grain, axisLabelMode, includeYear),
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
  const resolvedDataSource =
    tileDefinition.type === "donut"
      ? "aggregate"
      : tile.dataSource ?? tileDefinition.data.source
  const resolvedGroupBy =
    tileDefinition.type === "donut" ? tile.groupBy.slice(0, 1) : tile.groupBy
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
        resolvedDataSource,
        tile.grain,
        tile.startTime,
        tile.endTime,
        tile.metricKeys.join(","),
        resolvedGroupBy.join(","),
        filtersKey,
      ].join("|"),
    [
      tile.apiBaseUrl,
      tile.vizType,
      resolvedDataSource,
      tile.grain,
      tile.startTime,
      tile.endTime,
      tile.metricKeys.join(","),
      resolvedGroupBy.join(","),
      filtersKey,
    ]
  )

  const [state, setState] = useState<TileDataState>(() => ({
    status: "loading",
    data: createEmptyData(metrics),
    lastUpdated: null,
    isRefreshing: false,
    error: undefined,
  }))

  useEffect(() => {
    let isActive = true
    const controller = new AbortController()
    const { signal } = controller
    setState((prev) => ({
      status: prev.data.metrics.length ? "live" : "loading",
      data: prev.data.metrics.length ? prev.data : createEmptyData(metrics),
      lastUpdated: prev.lastUpdated ?? null,
      isRefreshing: false,
      error: undefined,
    }))

    const setLiveData = (
      data: TileSeriesData,
      lastUpdated: number | null,
      isRefreshing: boolean
    ) => {
      if (!isActive || signal.aborted) {
        return
      }
      setState({ status: "live", data, lastUpdated, isRefreshing })
    }

    const finalizeData = (data: TileSeriesData, groupBy: string[]) => {
      if (tile.vizType === "donut" && resolvedDataSource === "aggregate") {
        return {
          ...data,
          series: buildCategorySeries(
            data.aggregates,
            groupBy,
            data.primaryMetric.key
          ),
        }
      }
      return data
    }

    const load = async () => {
      try {
        const dataSource = resolvedDataSource
        const resolvedRange = await resolveTimeRange(
          tile,
          tileDefinition.data.range,
          signal
        )
        const hasRange = resolvedRange !== null
        const baseTile =
          resolvedRange
            ? {
                ...tile,
                startTime: resolvedRange.startTime,
                endTime: resolvedRange.endTime,
              }
            : tile
        const requestTile = { ...baseTile, groupBy: resolvedGroupBy }
        if (!requestTile.metricKeys.length) {
          throw new Error("Select at least one metric.")
        }
        let data: TileSeriesData | null = null
        if (dataSource === "aggregate") {
          if (!hasRange) {
            throw new Error("Select a start and end time or use the available range.")
          }
          const aggregateKey = getCacheKey([
            "aggregate",
            tile.apiBaseUrl,
            requestTile.metricKeys.join(","),
            requestTile.grain,
            requestTile.startTime,
            requestTile.endTime,
            requestTile.groupBy.join(","),
            filtersKey,
          ])
          const aggregateResult = fetchWithCache(
            aggregateCache,
            aggregateKey,
            (fetchSignal) =>
              fetchAggregate(tile.apiBaseUrl, requestTile, { signal: fetchSignal }),
            signal
          )
          if (aggregateResult.value) {
            data = finalizeData(
              buildAggregateData(
                requestTile,
                metricsByKey,
                aggregateResult.value.groups
              ),
              requestTile.groupBy
            )
            setLiveData(
              data,
              aggregateResult.lastUpdated ?? getCacheLastUpdated(aggregateCache, aggregateKey),
              Boolean(aggregateResult.revalidate)
            )
          }
          if (aggregateResult.revalidate) {
            const response = await aggregateResult.revalidate
            data = finalizeData(
              buildAggregateData(requestTile, metricsByKey, response.groups),
              requestTile.groupBy
            )
            setLiveData(
              data,
              getCacheLastUpdated(aggregateCache, aggregateKey),
              false
            )
          }
        } else if (dataSource === "timeseries") {
          if (!hasRange) {
            throw new Error("Select a start and end time or use the available range.")
          }
          const timeseriesKey = getCacheKey([
            "timeseries",
            tile.apiBaseUrl,
            requestTile.metricKeys.join(","),
            requestTile.grain,
            requestTile.startTime,
            requestTile.endTime,
            requestTile.groupBy.join(","),
            filtersKey,
          ])
          const timeseriesResult = fetchWithCache(
            timeseriesCache,
            timeseriesKey,
            (fetchSignal) =>
              fetchTimeseries(tile.apiBaseUrl, requestTile, { signal: fetchSignal }),
            signal
          )
          if (timeseriesResult.value) {
            data = finalizeData(
              buildTimeseriesData(
                requestTile,
                metricsByKey,
                timeseriesResult.value.series
              ),
              requestTile.groupBy
            )
            setLiveData(
              data,
              timeseriesResult.lastUpdated ??
                getCacheLastUpdated(timeseriesCache, timeseriesKey),
              Boolean(timeseriesResult.revalidate)
            )
          }
          if (timeseriesResult.revalidate) {
            const response = await timeseriesResult.revalidate
            data = finalizeData(
              buildTimeseriesData(requestTile, metricsByKey, response.series),
              requestTile.groupBy
            )
            setLiveData(
              data,
              getCacheLastUpdated(timeseriesCache, timeseriesKey),
              false
            )
          }
        } else {
          if (!hasRange) {
            const latestKey = getCacheKey([
              "latest",
              tile.apiBaseUrl,
              tile.metricKeys[0],
              tile.grain,
              filtersKey,
            ])
            const latestResult = fetchWithCache(
              latestCache,
              latestKey,
              (fetchSignal) =>
                fetchLatest(tile.apiBaseUrl, tile, { signal: fetchSignal }),
              signal
            )
            if (latestResult.value) {
              data = finalizeData(
                buildLatestData(primaryMetric, latestResult.value.value),
                requestTile.groupBy
              )
              setLiveData(
                data,
                latestResult.lastUpdated ?? getCacheLastUpdated(latestCache, latestKey),
                Boolean(latestResult.revalidate)
              )
            }
            if (latestResult.revalidate) {
              const latest = await latestResult.revalidate
              data = finalizeData(
                buildLatestData(primaryMetric, latest.value),
                requestTile.groupBy
              )
              setLiveData(
                data,
                getCacheLastUpdated(latestCache, latestKey),
                false
              )
            }
          } else {
            const timeseriesKey = getCacheKey([
              "timeseries",
              tile.apiBaseUrl,
              requestTile.metricKeys.join(","),
              requestTile.grain,
              requestTile.startTime,
              requestTile.endTime,
              requestTile.groupBy.join(","),
              filtersKey,
            ])
            const timeseriesResult = fetchWithCache(
              timeseriesCache,
              timeseriesKey,
              (fetchSignal) =>
                fetchTimeseries(tile.apiBaseUrl, requestTile, { signal: fetchSignal }),
              signal
            )
            const useTimeseriesValue = (value: TimeseriesResponse) =>
              finalizeData(
                buildTimeseriesData(requestTile, metricsByKey, value.series),
                requestTile.groupBy
              )
            const applyTimeseries = (value: TimeseriesResponse) => {
              data = useTimeseriesValue(value)
              setLiveData(
                data,
                getCacheLastUpdated(timeseriesCache, timeseriesKey),
                false
              )
            }
            const hasCachedTimeseries = Boolean(timeseriesResult.value)
            if (timeseriesResult.value) {
              const cached = timeseriesResult.value
              if (cached.series.length > 0) {
                data = useTimeseriesValue(cached)
                setLiveData(
                  data,
                  timeseriesResult.lastUpdated ??
                    getCacheLastUpdated(timeseriesCache, timeseriesKey),
                  Boolean(timeseriesResult.revalidate)
                )
              }
            }
            const response = timeseriesResult.revalidate
              ? await timeseriesResult.revalidate
              : timeseriesResult.value
            if (!response) {
              throw new Error("Failed to load live data.")
            }
            if (response.series.length === 0) {
              const latestKey = getCacheKey([
                "latest",
                tile.apiBaseUrl,
                tile.metricKeys[0],
                tile.grain,
                filtersKey,
              ])
              const latestResult = fetchWithCache(
                latestCache,
                latestKey,
                (fetchSignal) =>
                  fetchLatest(tile.apiBaseUrl, tile, { signal: fetchSignal }),
                signal
              )
              if (latestResult.value) {
                data = finalizeData(
                  buildLatestData(primaryMetric, latestResult.value.value),
                  requestTile.groupBy
                )
                setLiveData(
                  data,
                  latestResult.lastUpdated ??
                    getCacheLastUpdated(latestCache, latestKey),
                  Boolean(latestResult.revalidate)
                )
              }
              if (latestResult.revalidate) {
                const latest = await latestResult.revalidate
                data = finalizeData(
                  buildLatestData(primaryMetric, latest.value),
                  requestTile.groupBy
                )
                setLiveData(
                  data,
                  getCacheLastUpdated(latestCache, latestKey),
                  false
                )
              }
            } else {
              if (!hasCachedTimeseries) {
                applyTimeseries(response)
              } else if (timeseriesResult.revalidate) {
                applyTimeseries(response)
              }
            }
          }
        }
      } catch (error) {
        if (!isActive || signal.aborted || isAbortError(error)) {
          return
        }
        const message =
          error instanceof Error ? error.message : "Failed to load live data."
        setState((prev) => ({
          ...prev,
          status: "error",
          error: message,
          isRefreshing: false,
        }))
      }
    }

    load()
    return () => {
      isActive = false
      controller.abort()
    }
  }, [requestKey, metrics, metricsByKey, primaryMetric, tileDefinition])

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
    const axisLabelMode = resolveAxisLabelMode(tile)
    const includeYear =
      axisLabelMode === "full" ||
      (axisLabelMode === "auto" && yearSet.size > 1)
    const chartData = data.chartData.map((row) => {
      const time = String(row.time ?? "")
      if (!time) {
        return row
      }
      return {
        ...row,
        period: formatPeriodLabel(time, tile.grain, axisLabelMode, includeYear),
      }
    })
    return { ...state, data: { ...data, chartData } }
  }, [state, tile.grain, tile.visuals])

  return resolvedState
}
