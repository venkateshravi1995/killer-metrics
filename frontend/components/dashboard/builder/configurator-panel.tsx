"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import type { AvailabilityResponse, DimensionValueItem } from "../api"
import { fetchAvailability, fetchDimensionValues } from "../api"
import { DefaultTileConfigurator } from "../tiles/configurator/default"
import type { TileConfiguratorComponent, TileDefinition } from "../tiles/types"
import { getTileDefinition, getTileDefinitions } from "../tiles/registry"
import type {
  DimensionDefinition,
  DimensionKey,
  Filter as TileFilter,
  MetricDefinition,
  SeriesDefinition,
  TileConfig,
} from "../types"
import { createId } from "./utils"

export type ConfiguratorPanelProps = {
  tile: TileConfig
  onUpdate: (tileId: string, updates: Partial<TileConfig>) => void
  metrics: MetricDefinition[]
  dimensions: DimensionDefinition[]
  series: SeriesDefinition[]
}

export function ConfiguratorPanel({
  tile,
  onUpdate,
  metrics,
  dimensions,
  series,
}: ConfiguratorPanelProps) {
  const tileDefinition = getTileDefinition(tile.vizType) as TileDefinition<TileConfig>
  const primaryMetricKey = tile.metricKeys[0] ?? ""
  const dataSource = tile.dataSource ?? tileDefinition.data.source
  const tileDefinitions = getTileDefinitions()
  const visuals = tile.visuals as Record<string, unknown>
  const [activeTab, setActiveTab] = useState<"data" | "visuals">("data")
  const dimensionsByKey = useMemo(
    () => new Map(dimensions.map((dimension) => [dimension.key, dimension])),
    [dimensions]
  )
  const [availabilityState, setAvailabilityState] = useState<{
    key: string
    data: AvailabilityResponse | null
    status: "idle" | "ready" | "error"
    error: string | null
  }>({ key: "", data: null, status: "idle", error: null })
  const filtersKey = useMemo(
    () =>
      tile.filters
        .filter((filter) => filter.dimensionId && (filter.valueIds ?? []).length)
        .map(
          (filter) =>
            `${filter.dimensionId}:${(filter.valueIds ?? []).join(",")}`
        )
        .join("|"),
    [tile.filters]
  )
  const dimensionKeysInUse = useMemo(() => {
    const keys = new Set<string>()
    tile.filters.forEach((filter) => {
      if (filter.dimension) {
        keys.add(filter.dimension)
      }
    })
    tile.groupBy.forEach((key) => {
      if (key) {
        keys.add(key)
      }
    })
    return Array.from(keys)
  }, [tile.filters, tile.groupBy])
  const valuesContextKey = useMemo(
    () =>
      [tile.apiBaseUrl, primaryMetricKey, tile.startTime, tile.endTime].join("|"),
    [tile.apiBaseUrl, primaryMetricKey, tile.startTime, tile.endTime]
  )
  const [dimensionValuesByContext, setDimensionValuesByContext] = useState<
    Record<string, Record<string, DimensionValueItem[]>>
  >({})
  const [dimensionValuesStatusByContext, setDimensionValuesStatusByContext] = useState<
    Record<string, Record<string, "loading" | "ready" | "error">>
  >({})
  const valuesContextRef = useRef(valuesContextKey)
  const isMountedRef = useRef(true)
  const inFlightKeysRef = useRef(new Map<string, Set<string>>())
  const emptyValues = useMemo(
    () => ({} as Record<string, DimensionValueItem[]>),
    []
  )
  const emptyStatus = useMemo(
    () => ({} as Record<string, "loading" | "ready" | "error">),
    []
  )

  const availabilityRequestKey = useMemo(
    () =>
      [
        tile.apiBaseUrl,
        primaryMetricKey,
        tile.grain,
        tile.startTime,
        tile.endTime,
        filtersKey,
      ].join("|"),
    [
      tile.apiBaseUrl,
      primaryMetricKey,
      tile.grain,
      tile.startTime,
      tile.endTime,
      filtersKey,
    ]
  )
  const shouldFetchAvailability = activeTab === "data" && Boolean(primaryMetricKey)
  const isAvailabilityCurrent = availabilityState.key === availabilityRequestKey
  const availability =
    shouldFetchAvailability && isAvailabilityCurrent ? availabilityState.data : null
  const availabilityStatus = !shouldFetchAvailability
    ? "idle"
    : isAvailabilityCurrent
      ? availabilityState.status === "idle"
        ? "loading"
        : availabilityState.status
      : "loading"
  const availabilityError =
    shouldFetchAvailability && isAvailabilityCurrent ? availabilityState.error : null
  const dimensionValues =
    dimensionValuesByContext[valuesContextKey] ?? emptyValues
  const dimensionValuesStatusRaw =
    dimensionValuesStatusByContext[valuesContextKey] ?? emptyStatus
  const dimensionValuesStatus = useMemo(() => {
    if (activeTab !== "data") {
      return dimensionValuesStatusRaw
    }
    const next = { ...dimensionValuesStatusRaw }
    dimensionKeysInUse.forEach((key) => {
      if (!next[key] && !dimensionValues[key]) {
        next[key] = "loading"
      }
    })
    return next
  }, [activeTab, dimensionKeysInUse, dimensionValues, dimensionValuesStatusRaw])

  useEffect(() => {
    valuesContextRef.current = valuesContextKey
  }, [valuesContextKey])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!shouldFetchAvailability) {
      return
    }
    let isActive = true
    fetchAvailability(tile.apiBaseUrl, tile)
      .then((data) => {
        if (!isActive) {
          return
        }
        setAvailabilityState({
          key: availabilityRequestKey,
          data,
          status: "ready",
          error: null,
        })
      })
      .catch((error) => {
        if (!isActive) {
          return
        }
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load availability."
        setAvailabilityState({
          key: availabilityRequestKey,
          data: null,
          status: "error",
          error: message,
        })
      })

    return () => {
      isActive = false
    }
  }, [
    availabilityRequestKey,
    shouldFetchAvailability,
    tile,
    tile.apiBaseUrl,
    tile.grain,
  ])

  useEffect(() => {
    if (activeTab !== "data") {
      return
    }
    const requestContext = valuesContextRef.current
    const inFlight = inFlightKeysRef.current
    const inFlightKeys = inFlight.get(requestContext) ?? new Set<string>()
    const keysToFetch = dimensionKeysInUse.filter((key) => {
      if (!key || dimensionValues[key]) {
        return false
      }
      if (dimensionValuesStatusRaw[key] === "error") {
        return false
      }
      return !inFlightKeys.has(key)
    })
    if (!keysToFetch.length) {
      return
    }
    keysToFetch.forEach((key) => {
      inFlightKeys.add(key)
      inFlight.set(requestContext, inFlightKeys)
      fetchDimensionValues(tile.apiBaseUrl, key, {
        metricKey: primaryMetricKey || undefined,
        startTime: tile.startTime || undefined,
        endTime: tile.endTime || undefined,
      })
        .then((response) => {
          const currentSet = inFlight.get(requestContext)
          if (currentSet) {
            currentSet.delete(key)
            if (currentSet.size === 0) {
              inFlight.delete(requestContext)
            }
          }
          if (
            !isMountedRef.current ||
            valuesContextRef.current !== requestContext
          ) {
            return
          }
          setDimensionValuesByContext((prev) => ({
            ...prev,
            [requestContext]: {
              ...(prev[requestContext] ?? {}),
              [key]: response.items,
            },
          }))
          setDimensionValuesStatusByContext((prev) => ({
            ...prev,
            [requestContext]: {
              ...(prev[requestContext] ?? {}),
              [key]: "ready",
            },
          }))
        })
        .catch(() => {
          const currentSet = inFlight.get(requestContext)
          if (currentSet) {
            currentSet.delete(key)
            if (currentSet.size === 0) {
              inFlight.delete(requestContext)
            }
          }
          if (
            !isMountedRef.current ||
            valuesContextRef.current !== requestContext
          ) {
            return
          }
          setDimensionValuesStatusByContext((prev) => ({
            ...prev,
            [requestContext]: { ...(prev[requestContext] ?? {}), [key]: "error" },
          }))
        })
    })
  }, [
    activeTab,
    dimensionKeysInUse,
    dimensionValues,
    dimensionValuesStatusRaw,
    tile.apiBaseUrl,
    primaryMetricKey,
    tile.startTime,
    tile.endTime,
  ])

  useEffect(() => {
    if (!tile.filters.length) {
      return
    }
    const nextFilters = tile.filters.map((filter) => {
      const dimension = filter.dimension
      const dimensionId =
        filter.dimensionId || dimensionsByKey.get(dimension)?.id || 0
      const values = dimensionValues[dimension] ?? []
      if (!values.length) {
        return { ...filter, dimensionId }
      }
      const valueByLabel = new Map(values.map((item) => [item.value, item.id]))
      const resolvedIds = filter.values
        .map((value) => valueByLabel.get(value))
        .filter((valueId): valueId is number => typeof valueId === "number")
      if (!filter.values.length) {
        const first = values[0]
        return {
          ...filter,
          dimensionId,
          values: first ? [first.value] : [],
          valueIds: first ? [first.id] : [],
        }
      }
      if (
        resolvedIds.length &&
        resolvedIds.join("|") !== (filter.valueIds ?? []).join("|")
      ) {
        return { ...filter, dimensionId, valueIds: resolvedIds }
      }
      return { ...filter, dimensionId }
    })
    const changed = nextFilters.some(
      (filter, index) =>
        filter.values.join("|") !== tile.filters[index]?.values.join("|")
    )
    if (changed) {
      onUpdate(tile.id, { filters: nextFilters })
    }
  }, [dimensionValues, tile.filters, tile.id, onUpdate])

  const updateFilter = (filterId: string, updates: Partial<TileFilter>) => {
    onUpdate(tile.id, {
      filters: tile.filters.map((filter) =>
        filter.id === filterId ? { ...filter, ...updates } : filter
      ),
    })
  }

  const removeFilter = (filterId: string) => {
    onUpdate(tile.id, {
      filters: tile.filters.filter((filter) => filter.id !== filterId),
    })
  }

  const addFilter = () => {
    const used = new Set(tile.filters.map((filter) => filter.dimension))
    const nextDimension: DimensionKey =
      dimensions.find((dimension) => !used.has(dimension.key))?.key ??
      dimensions[0]?.key ??
      ""
    if (!nextDimension) {
      return
    }
    const nextValues = dimensionValues[nextDimension] ?? []
    const nextDimensionId = dimensionsByKey.get(nextDimension)?.id ?? 0
    const firstValue = nextValues[0]
    onUpdate(tile.id, {
      filters: [
        ...tile.filters,
        {
          id: createId("filter"),
          dimension: nextDimension,
          dimensionId: nextDimensionId,
          values: firstValue ? [firstValue.value] : [],
          valueIds: firstValue ? [firstValue.id] : [],
        },
      ],
    })
  }

  const maxMetrics = tileDefinition.data.maxMetrics ?? metrics.length
  const comparisonAllowed =
    dataSource === "timeseries" || tileDefinition.type === "kpi"

  const toggleMetric = (metricKey: string, enabled: boolean) => {
    const selected = new Set(tile.metricKeys)
    if (enabled) {
      selected.add(metricKey)
    } else if (selected.size > 1) {
      selected.delete(metricKey)
    }
    const next = Array.from(selected)
    if (maxMetrics && next.length > maxMetrics) {
      return
    }
    const disableComparison =
      Boolean(visuals.showComparison) &&
      (!comparisonAllowed || next.length > 1 || tile.groupBy.length > 0)
    onUpdate(tile.id, {
      metricKeys: next,
      ...(disableComparison
        ? { visuals: { showComparison: false } as TileConfig["visuals"] }
        : {}),
    })
  }

  const toggleGroupBy = (dimensionKey: string, enabled: boolean) => {
    const selected = new Set(tile.groupBy)
    if (enabled) {
      selected.add(dimensionKey)
    } else {
      selected.delete(dimensionKey)
    }
    const next = Array.from(selected)
    const disableComparison =
      Boolean(visuals.showComparison) &&
      (!comparisonAllowed || tile.metricKeys.length > 1 || next.length > 0)
    onUpdate(tile.id, {
      groupBy: next,
      ...(disableComparison
        ? { visuals: { showComparison: false } as TileConfig["visuals"] }
        : {}),
    })
  }

  const updateSeriesColor = (seriesKey: string, color: string | null) => {
    const nextColors = {
      ...(visuals.seriesColors as Record<string, string> | undefined),
    }
    if (!color) {
      delete nextColors[seriesKey]
    } else {
      nextColors[seriesKey] = color
    }
    onUpdate(tile.id, { visuals: { seriesColors: nextColors } as TileConfig["visuals"] })
  }

  const clearSeriesColors = () => {
    onUpdate(tile.id, { visuals: { seriesColors: {} } as TileConfig["visuals"] })
  }

  const ConfiguratorComponent = (tileDefinition.configurator ??
    DefaultTileConfigurator) as TileConfiguratorComponent<TileConfig>

  return (
    <ConfiguratorComponent
      tile={tile}
      onUpdate={onUpdate}
      metrics={metrics}
      dimensions={dimensions}
      series={series}
      tileDefinition={tileDefinition}
      tileDefinitions={tileDefinitions}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      availability={availability}
      availabilityStatus={availabilityStatus}
      availabilityError={availabilityError}
      dimensionValues={dimensionValues}
      dimensionValuesStatus={dimensionValuesStatus}
      addFilter={addFilter}
      updateFilter={updateFilter}
      removeFilter={removeFilter}
      toggleMetric={toggleMetric}
      toggleGroupBy={toggleGroupBy}
      updateSeriesColor={updateSeriesColor}
      clearSeriesColors={clearSeriesColors}
    />
  )
}
