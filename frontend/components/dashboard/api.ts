import { getNeonAuthToken } from "@/lib/neon-auth-token"

import type { DashboardConfig, Filter, TileConfig } from "./types"

export type TimeseriesResponse = {
  metric_keys: string[]
  grain: string
  series: Array<{
    metric_key: string
    dimensions: Record<string, string>
    points: Array<{ time_start_ts: string; value: number }>
  }>
}

export type MetricCatalogItem = {
  metric_id: number
  metric_key: string
  metric_name: string
  metric_description?: string | null
  unit?: string | null
  metric_type: string
  directionality?: string | null
  aggregation: string
  is_active: boolean
}

export type MetricsResponse = {
  items: MetricCatalogItem[]
  limit: number
  offset: number
}

export type DimensionCatalogItem = {
  dimension_id: number
  dimension_key: string
  dimension_name: string
  dimension_description?: string | null
  value_type: string
  is_active: boolean
}

export type DimensionsResponse = {
  items: DimensionCatalogItem[]
  limit: number
  offset: number
}

export type DimensionValueItem = {
  id: number
  value: string
}

export type DimensionValuesResponse = {
  dimension_key: string
  items: DimensionValueItem[]
  limit: number
  offset: number
}

export type LatestResponse = {
  metric_key: string
  grain: string
  time_start_ts: string | null
  value: number | null
}

export type AvailabilityResponse = {
  metric_key: string
  grain: string
  min_time_start_ts: string | null
  max_time_start_ts: string | null
}

export type AggregateResponse = {
  metric_keys: string[]
  grain: string
  groups: Array<{
    metric_key: string
    dimensions: Record<string, string>
    value: number
  }>
}

export type DashboardSummary = {
  id: string
  name: string
  description?: string | null
  updated_at: string
}

export type DashboardListResponse = {
  items: DashboardSummary[]
  limit: number
  next_cursor?: string | null
}

export type DashboardResponse = {
  id: string
  client_id: string
  name: string
  description?: string | null
  config: DashboardConfig | Record<string, unknown>
  created_at: string
  updated_at: string
  is_draft: boolean
}

export function normalizeBaseUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    const fallback =
      typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_BASE_URL : ""
    return fallback && fallback.trim()
      ? fallback.trim().replace(/\/$/, "")
      : "http://localhost:8000"
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed
}

export function normalizeDashboardBaseUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    const fallback =
      typeof process !== "undefined"
        ? process.env.NEXT_PUBLIC_DASHBOARDING_API_BASE_URL
        : ""
    return fallback && fallback.trim()
      ? fallback.trim().replace(/\/$/, "")
      : "http://localhost:8100"
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed
}

function buildDimensionPairs(filters: Filter[]) {
  return filters
    .filter((filter) => filter.dimensionId && (filter.valueIds ?? []).length)
    .flatMap((filter) =>
      Array.from(new Set(filter.valueIds ?? []))
        .filter((valueId) => Number.isFinite(valueId))
        .map((valueId) => `${filter.dimensionId}:${valueId}`)
    )
}

async function fetchJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, await withAuthHeaders(init))
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

async function fetchNoContent(input: string, init?: RequestInit) {
  const response = await fetch(input, await withAuthHeaders(init))
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }
}

async function withAuthHeaders(init?: RequestInit) {
  const token = await getNeonAuthToken()
  if (!token) {
    return init
  }
  const headers = new Headers(init?.headers)
  headers.set("Authorization", `Bearer ${token}`)
  return { ...init, headers }
}

function buildDashboardHeaders(includeContentType = false) {
  const headers: Record<string, string> = {}
  if (includeContentType) {
    headers["Content-Type"] = "application/json"
  }
  return headers
}

export function buildLatestUrl(baseUrl: string, tile: TileConfig) {
  const params = new URLSearchParams()
  const metricKey = tile.metricKeys[0] ?? ""
  params.set("metric_key", metricKey)
  params.set("grain", tile.grain)
  buildDimensionPairs(tile.filters).forEach((dimension) =>
    params.append("dimensions", dimension)
  )
  return `${normalizeBaseUrl(baseUrl)}/v1/query/latest?${params.toString()}`
}

export function buildMetricsUrl(baseUrl: string) {
  const params = new URLSearchParams()
  params.set("is_active", "true")
  return `${normalizeBaseUrl(baseUrl)}/v1/metrics?${params.toString()}`
}

export function buildDimensionsUrl(baseUrl: string) {
  const params = new URLSearchParams()
  params.set("is_active", "true")
  return `${normalizeBaseUrl(baseUrl)}/v1/dimensions?${params.toString()}`
}

export function buildDimensionValuesUrl(
  baseUrl: string,
  dimensionKey: string,
  options?: {
    metricKey?: string
    startTime?: string
    endTime?: string
  }
) {
  const encodedKey = encodeURIComponent(dimensionKey)
  return `${normalizeBaseUrl(baseUrl)}/v1/dimensions/${encodedKey}/values`
}

export function buildAvailabilityUrl(baseUrl: string, tile: TileConfig) {
  const params = new URLSearchParams()
  params.set("grain", tile.grain)
  buildDimensionPairs(tile.filters).forEach((dimension) =>
    params.append("dimensions", dimension)
  )
  const metricKey = encodeURIComponent(tile.metricKeys[0] ?? "")
  return `${normalizeBaseUrl(baseUrl)}/v1/metrics/${metricKey}/availability?${params.toString()}`
}

export async function fetchTimeseries(
  baseUrl: string,
  tile: TileConfig,
  options?: { signal?: AbortSignal }
) {
  const url = `${normalizeBaseUrl(baseUrl)}/v1/query/timeseries`
  return fetchJson<TimeseriesResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options?.signal,
    body: JSON.stringify({
      metric_keys: tile.metricKeys,
      grain: tile.grain,
      start_time: tile.startTime,
      end_time: tile.endTime,
      group_by: tile.groupBy,
      filters: tile.filters
        .filter((filter) => filter.dimensionId && (filter.valueIds ?? []).length)
        .map((filter) => ({
          dimension_id: filter.dimensionId,
          value_ids: filter.valueIds ?? [],
        })),
    }),
  })
}

export async function fetchLatest(
  baseUrl: string,
  tile: TileConfig,
  options?: { signal?: AbortSignal }
) {
  const url = buildLatestUrl(baseUrl, tile)
  return fetchJson<LatestResponse>(url, { signal: options?.signal })
}

export async function fetchMetrics(baseUrl: string) {
  const url = buildMetricsUrl(baseUrl)
  return fetchJson<MetricsResponse>(url)
}

export async function fetchDimensions(baseUrl: string) {
  const url = buildDimensionsUrl(baseUrl)
  return fetchJson<DimensionsResponse>(url)
}

export async function fetchDimensionValues(
  baseUrl: string,
  dimensionKey: string,
  options?: {
    metricKey?: string
    startTime?: string
    endTime?: string
  }
) {
  const url = `${normalizeBaseUrl(baseUrl)}/v1/dimensions/values/search`
  const response = await fetchJson<{
    items: Array<{ dimension_key: string; value_id: number; value: string }>
    limit: number
    offset: number
  }>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filters: {
        dimension_key: [dimensionKey],
        metric_key: options?.metricKey,
        start_time: options?.startTime,
        end_time: options?.endTime,
      },
      limit: 500,
      offset: 0,
    }),
  })
  return {
    dimension_key: dimensionKey,
    items: response.items
      .filter((item) => item.dimension_key === dimensionKey)
      .map((item) => ({ id: item.value_id, value: item.value })),
    limit: response.limit,
    offset: response.offset,
  }
}

export async function fetchAvailability(
  baseUrl: string,
  tile: TileConfig,
  options?: { signal?: AbortSignal }
) {
  const url = buildAvailabilityUrl(baseUrl, tile)
  return fetchJson<AvailabilityResponse>(url, { signal: options?.signal })
}

export async function fetchAggregate(
  baseUrl: string,
  tile: TileConfig,
  options?: { signal?: AbortSignal }
) {
  const url = `${normalizeBaseUrl(baseUrl)}/v1/query/aggregate`
  return fetchJson<AggregateResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options?.signal,
    body: JSON.stringify({
      metric_keys: tile.metricKeys,
      grain: tile.grain,
      start_time: tile.startTime,
      end_time: tile.endTime,
      group_by: tile.groupBy,
      filters: tile.filters
        .filter((filter) => filter.dimensionId && (filter.valueIds ?? []).length)
        .map((filter) => ({
          dimension_id: filter.dimensionId,
          value_ids: filter.valueIds ?? [],
        })),
    }),
  })
}

export function buildDashboardsUrl(
  baseUrl: string,
  options?: {
    limit?: number
    cursor?: string
  }
) {
  const params = new URLSearchParams()
  if (options?.limit) {
    params.set("limit", String(options.limit))
  }
  if (options?.cursor) {
    params.set("cursor", options.cursor)
  }
  const suffix = params.toString() ? `?${params.toString()}` : ""
  return `${normalizeDashboardBaseUrl(baseUrl)}/v1/dashboards${suffix}`
}

export function buildDashboardUrl(baseUrl: string, dashboardId: string) {
  const encodedId = encodeURIComponent(dashboardId)
  return `${normalizeDashboardBaseUrl(baseUrl)}/v1/dashboards/${encodedId}`
}

function buildDashboardDraftUrl(baseUrl: string, dashboardId: string, suffix = "") {
  const base = buildDashboardUrl(baseUrl, dashboardId)
  return `${base}/draft${suffix}`
}

function buildDashboardDraftTileUrl(
  baseUrl: string,
  dashboardId: string,
  tileId?: string
) {
  const suffix = tileId ? `/tiles/${encodeURIComponent(tileId)}` : "/tiles"
  return buildDashboardDraftUrl(baseUrl, dashboardId, suffix)
}

export async function fetchDashboards(
  baseUrl: string,
  options?: {
    limit?: number
    cursor?: string
  }
) {
  const url = buildDashboardsUrl(baseUrl, options)
  return fetchJson<DashboardListResponse>(url, {
    headers: buildDashboardHeaders(),
  })
}

export async function fetchDashboard(baseUrl: string, dashboardId: string) {
  const url = buildDashboardUrl(baseUrl, dashboardId)
  return fetchJson<DashboardResponse>(url, {
    headers: buildDashboardHeaders(),
  })
}

export async function createDashboard(
  baseUrl: string,
  payload: {
    name: string
    description?: string
    config: DashboardConfig
  }
) {
  const url = buildDashboardsUrl(baseUrl)
  return fetchJson<DashboardResponse>(url, {
    method: "POST",
    headers: buildDashboardHeaders(true),
    body: JSON.stringify(payload),
  })
}

export async function updateDashboard(
  baseUrl: string,
  dashboardId: string,
  payload: {
    name: string
    description?: string
    config: DashboardConfig
  }
) {
  const url = buildDashboardUrl(baseUrl, dashboardId)
  return fetchJson<DashboardResponse>(url, {
    method: "PUT",
    headers: buildDashboardHeaders(true),
    body: JSON.stringify(payload),
  })
}

export async function deleteDashboard(baseUrl: string, dashboardId: string) {
  const url = buildDashboardUrl(baseUrl, dashboardId)
  const response = await fetch(url, {
    method: "DELETE",
    headers: buildDashboardHeaders(),
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }
}

export async function createDraftTile(
  baseUrl: string,
  dashboardId: string,
  tile: TileConfig
) {
  const url = buildDashboardDraftTileUrl(baseUrl, dashboardId)
  return fetchNoContent(url, {
    method: "POST",
    headers: buildDashboardHeaders(true),
    body: JSON.stringify(tile),
  })
}

export async function updateDraftTile(
  baseUrl: string,
  dashboardId: string,
  tileId: string,
  tile: TileConfig
) {
  const url = buildDashboardDraftTileUrl(baseUrl, dashboardId, tileId)
  return fetchNoContent(url, {
    method: "PUT",
    headers: buildDashboardHeaders(true),
    body: JSON.stringify(tile),
  })
}

export async function deleteDraftTile(
  baseUrl: string,
  dashboardId: string,
  tileId: string
) {
  const url = buildDashboardDraftTileUrl(baseUrl, dashboardId, tileId)
  return fetchNoContent(url, {
    method: "DELETE",
    headers: buildDashboardHeaders(),
  })
}

export async function updateDraftLayout(
  baseUrl: string,
  dashboardId: string,
  payload: {
    items: Array<{ id: string; layout: TileConfig["layout"] }>
  }
) {
  const url = new URL(buildDashboardDraftUrl(baseUrl, dashboardId, "/layout"))
  url.searchParams.set("allow_missing", "true")
  return fetchNoContent(url.toString(), {
    method: "PUT",
    headers: buildDashboardHeaders(true),
    body: JSON.stringify(payload),
  })
}

export async function updateDraftMetadata(
  baseUrl: string,
  dashboardId: string,
  payload: {
    name?: string | null
    description?: string | null
  }
) {
  const url = buildDashboardDraftUrl(baseUrl, dashboardId, "/metadata")
  return fetchNoContent(url, {
    method: "PATCH",
    headers: buildDashboardHeaders(true),
    body: JSON.stringify(payload),
  })
}

export async function commitDraft(baseUrl: string, dashboardId: string) {
  const url = buildDashboardDraftUrl(baseUrl, dashboardId, "/commit")
  return fetchJson<DashboardResponse>(url, {
    method: "POST",
    headers: buildDashboardHeaders(),
  })
}

export async function deleteDraft(baseUrl: string, dashboardId: string) {
  const url = buildDashboardDraftUrl(baseUrl, dashboardId)
  return fetchNoContent(url, {
    method: "DELETE",
    headers: buildDashboardHeaders(),
  })
}
