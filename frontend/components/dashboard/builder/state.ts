"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Layout } from "react-grid-layout/legacy"

import { tileDefaults } from "../data"
import type {
  DashboardConfig,
  DimensionDefinition,
  MetricDefinition,
  SeriesDefinition,
  TileConfig,
  VizType,
} from "../types"
import type { DashboardResponse, DashboardSummary } from "../api"
import {
  commitDraft,
  createDashboard,
  createDraftTile,
  deleteDashboard,
  deleteDraft,
  deleteDraftTile,
  fetchDashboard,
  fetchDashboards,
  fetchDimensions,
  fetchMetrics,
  normalizeDashboardBaseUrl,
  updateDraftLayout,
  updateDraftMetadata,
  updateDraftTile,
} from "../api"
import { getTileDefinition } from "../tiles/registry"
import {
  applyMinSize,
  buildLayouts,
  createId,
  createTileConfig,
  extractTilesFromConfig,
  gridCols,
  mapDimensionDefinition,
  mapMetricDefinition,
  normalizeTileConfig,
  packTiles,
  seedTiles,
  type BreakpointKey,
} from "./utils"

export type CatalogStatus = "loading" | "ready" | "error"
export type DashboardStatus = "idle" | "loading" | "saving" | "error"
export type DraftStatus = "idle" | "saving"
export type DeleteTarget = { id: string; name: string } | null

export type DashboardBuilderInitialData = {
  metrics?: MetricDefinition[]
  dimensions?: DimensionDefinition[]
  dashboards?: DashboardSummary[]
  activeDashboard?: DashboardResponse
}

export function useDashboardBuilderState(initialData?: DashboardBuilderInitialData) {
  const initialTiles = initialData?.activeDashboard
    ? extractTilesFromConfig(initialData.activeDashboard.config)
        .map((tile) => normalizeTileConfig(tile))
        .map((tile) => applyMinSize(tile, gridCols.lg))
    : []
  const [tiles, setTiles] = useState<TileConfig[]>(initialTiles)
  const [selectedTileId, setSelectedTileId] = useState<string | null>(
    initialTiles[0]?.id ?? null
  )
  const [editMode, setEditMode] = useState(true)
  const [activeBreakpoint, setActiveBreakpoint] =
    useState<BreakpointKey>("lg")
  const [metrics, setMetrics] = useState<MetricDefinition[]>(
    initialData?.metrics ?? []
  )
  const [dimensions, setDimensions] = useState<DimensionDefinition[]>(
    initialData?.dimensions ?? []
  )
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>(
    initialData?.metrics || initialData?.dimensions ? "ready" : "loading"
  )
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [dashboards, setDashboards] = useState<DashboardSummary[]>(
    initialData?.dashboards ?? []
  )
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(
    initialData?.activeDashboard?.id ?? null
  )
  const [dashboardName, setDashboardName] = useState(
    initialData?.activeDashboard?.name ?? "Killer Metric Studio"
  )
  const [dashboardDescription, setDashboardDescription] = useState(
    initialData?.activeDashboard?.description ?? ""
  )
  const [dashboardStatus, setDashboardStatus] = useState<DashboardStatus>("idle")
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [hasDraft, setHasDraft] = useState(
    Boolean(initialData?.activeDashboard?.is_draft)
  )
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("idle")
  const [draftError, setDraftError] = useState<string | null>(null)
  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number | null>(null)
  const [seriesByTileId, setSeriesByTileId] = useState<
    Record<string, SeriesDefinition[]>
  >({})
  const [isRenaming, setIsRenaming] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createDescription, setCreateDescription] = useState("")
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const [configuratorOpen, setConfiguratorOpen] = useState(false)
  const [configuratorMode, setConfiguratorMode] = useState<"edit" | "create">(
    "edit"
  )
  const [tilePickerOpen, setTilePickerOpen] = useState(false)
  const [pendingTile, setPendingTile] = useState<TileConfig | null>(null)
  const [isCompactView, setIsCompactView] = useState(false)

  const dashboardApiBaseUrl = useMemo(() => normalizeDashboardBaseUrl(""), [])

  const metricsByKey = useMemo(
    () => new Map(metrics.map((metric) => [metric.key, metric])),
    [metrics]
  )
  const dimensionsByKey = useMemo(
    () => new Map(dimensions.map((dimension) => [dimension.key, dimension])),
    [dimensions]
  )
  const activeBreakpointRef = useRef<BreakpointKey>(activeBreakpoint)
  const activeDashboardIdRef = useRef<string | null>(activeDashboardId)
  const dashboardStatusRef = useRef(dashboardStatus)
  const draftStatusRef = useRef(draftStatus)
  const tilesRef = useRef<TileConfig[]>([])
  const draftInFlightRef = useRef(0)
  const metadataRef = useRef({ name: dashboardName, description: dashboardDescription })
  const initialDataRef = useRef(initialData)
  const layoutDebounceRef = useRef<number | null>(null)
  const pendingLayoutTilesRef = useRef<TileConfig[] | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const media = window.matchMedia("(max-width: 767px)")
    const update = () => setIsCompactView(media.matches)
    update()
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update)
      return () => media.removeEventListener("change", update)
    }
    if (typeof media.addListener === "function") {
      media.addListener(update)
      return () => media.removeListener(update)
    }
    return undefined
  }, [])

  useEffect(() => {
    activeBreakpointRef.current = activeBreakpoint
  }, [activeBreakpoint])

  useEffect(() => {
    activeDashboardIdRef.current = activeDashboardId
  }, [activeDashboardId])

  useEffect(() => {
    dashboardStatusRef.current = dashboardStatus
  }, [dashboardStatus])

  useEffect(() => {
    draftStatusRef.current = draftStatus
  }, [draftStatus])

  useEffect(() => {
    tilesRef.current = tiles
  }, [tiles])

  useEffect(() => {
    return () => {
      if (layoutDebounceRef.current !== null) {
        clearTimeout(layoutDebounceRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!editMode) {
      setConfiguratorOpen(false)
    }
  }, [editMode])

  const resolveLayoutCols = useCallback((breakpoint: BreakpointKey) => {
    return gridCols[breakpoint] ?? gridCols.lg
  }, [])

  const applyDashboardTiles = useCallback(
    (nextTiles: TileConfig[]) => {
      const cols = resolveLayoutCols(activeBreakpointRef.current)
      setTiles(nextTiles.map((tile) => applyMinSize(tile, cols)))
    },
    [resolveLayoutCols]
  )

  const applyDashboardMetadata = useCallback(
    (name: string, description?: string | null) => {
      const nextDescription = description ?? ""
      setDashboardName(name)
      setDashboardDescription(nextDescription)
      metadataRef.current = { name, description: nextDescription }
    },
    []
  )

  const handleSeriesChange = useCallback(
    (tileId: string, series: SeriesDefinition[]) => {
      setSeriesByTileId((prev) => {
        const current = prev[tileId]
        if (
          current &&
          current.length === series.length &&
          current.every((entry, index) => entry.key === series[index]?.key)
        ) {
          return prev
        }
        return { ...prev, [tileId]: series }
      })
    },
    []
  )

  const persistDraftChange = useCallback(
    async (dashboardId: string, action: () => Promise<void>) => {
      if (!dashboardId) {
        return
      }
      setDraftError(null)
      draftInFlightRef.current += 1
      setDraftStatus("saving")
      try {
        await action()
        if (activeDashboardIdRef.current === dashboardId) {
          setHasDraft(true)
        }
      } catch (error) {
        if (activeDashboardIdRef.current !== dashboardId) {
          return
        }
        const message =
          error instanceof Error ? error.message : "Failed to save draft."
        setDraftError(message)
      } finally {
        draftInFlightRef.current = Math.max(0, draftInFlightRef.current - 1)
        if (activeDashboardIdRef.current === dashboardId) {
          setDraftStatus(draftInFlightRef.current > 0 ? "saving" : "idle")
        }
      }
    },
    []
  )

  const scheduleLayoutPersist = useCallback(
    (dashboardId: string, nextTiles: TileConfig[]) => {
      pendingLayoutTilesRef.current = nextTiles
      if (layoutDebounceRef.current !== null) {
        clearTimeout(layoutDebounceRef.current)
      }
      layoutDebounceRef.current = window.setTimeout(() => {
        const pending = pendingLayoutTilesRef.current
        if (!pending) {
          return
        }
        void persistDraftChange(dashboardId, async () => {
          await updateDraftLayout(dashboardApiBaseUrl, dashboardId, {
            items: pending.map((tile) => ({ id: tile.id, layout: tile.layout })),
          })
        })
        pendingLayoutTilesRef.current = null
      }, 350)
    },
    [dashboardApiBaseUrl, persistDraftChange]
  )

  const loadDashboard = useCallback(
    async (dashboardId: string) => {
      setDashboardStatus("loading")
      setDashboardError(null)
      try {
        const response = await fetchDashboard(dashboardApiBaseUrl, dashboardId)
        const nextTiles = extractTilesFromConfig(response.config)
        setActiveDashboardId(response.id)
        applyDashboardMetadata(response.name, response.description)
        setHasDraft(response.is_draft)
        setDraftStatus("idle")
        setDraftError(null)
        setIsRenaming(false)
        applyDashboardTiles(nextTiles)
        setSeriesByTileId({})
        setDashboardStatus("idle")
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load dashboard."
        setDashboardStatus("error")
        setDashboardError(message)
      }
    },
    [applyDashboardMetadata, applyDashboardTiles, dashboardApiBaseUrl]
  )

  const refreshDashboards = useCallback(async () => {
    setDashboardStatus("loading")
    setDashboardError(null)
    try {
      const response = await fetchDashboards(dashboardApiBaseUrl, { limit: 200 })
      setDashboards(response.items)
      if (response.items.length) {
        const currentId = activeDashboardIdRef.current
        const targetId =
          currentId && response.items.some((item) => item.id === currentId)
            ? currentId
            : response.items[0].id
        await loadDashboard(targetId)
      } else {
        setDashboards([])
        setActiveDashboardId(null)
        applyDashboardMetadata("Killer Metric Studio", "")
        setTiles([])
        setSelectedTileId(null)
        setHasDraft(false)
        setDraftStatus("idle")
        setDraftError(null)
        setIsRenaming(false)
        setSeriesByTileId({})
        setDashboardStatus("idle")
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load dashboards."
      setDashboardStatus("error")
      setDashboardError(message)
    }
  }, [applyDashboardMetadata, dashboardApiBaseUrl, loadDashboard])

  const performRefresh = useCallback(() => {
    setDashboardError(null)
    const dashboardId = activeDashboardIdRef.current
    if (dashboardId) {
      void loadDashboard(dashboardId)
      return
    }
    void refreshDashboards()
  }, [loadDashboard, refreshDashboards])

  useEffect(() => {
    if (!refreshIntervalMs) {
      return
    }
    const intervalId = setInterval(() => {
      const status = dashboardStatusRef.current
      if (
        status === "loading" ||
        status === "saving" ||
        draftStatusRef.current === "saving"
      ) {
        return
      }
      performRefresh()
    }, refreshIntervalMs)
    return () => clearInterval(intervalId)
  }, [performRefresh, refreshIntervalMs])

  useEffect(() => {
    const initial = initialDataRef.current
    if (initial?.dashboards?.length || initial?.activeDashboard) {
      if (initial.dashboards?.length) {
        setDashboards(initial.dashboards)
      }
      if (initial.activeDashboard) {
        setActiveDashboardId(initial.activeDashboard.id)
        activeDashboardIdRef.current = initial.activeDashboard.id
        applyDashboardMetadata(
          initial.activeDashboard.name,
          initial.activeDashboard.description
        )
        setHasDraft(Boolean(initial.activeDashboard.is_draft))
        setIsRenaming(false)
        const normalizedTiles = extractTilesFromConfig(
          initial.activeDashboard.config
        ).map((tile) => normalizeTileConfig(tile))
        applyDashboardTiles(normalizedTiles)
        setSelectedTileId(normalizedTiles[0]?.id ?? null)
        setSeriesByTileId({})
      }
      return
    }

    refreshDashboards()
  }, [applyDashboardMetadata, applyDashboardTiles, refreshDashboards])

  useEffect(() => {
    if (initialDataRef.current?.metrics || initialDataRef.current?.dimensions) {
      return
    }
    let isActive = true
    setCatalogStatus("loading")
    setCatalogError(null)

    Promise.all([
      fetchMetrics(tileDefaults.apiBaseUrl),
      fetchDimensions(tileDefaults.apiBaseUrl),
    ])
      .then(([metricsResponse, dimensionsResponse]) => {
        if (!isActive) {
          return
        }
        setMetrics(metricsResponse.items.map(mapMetricDefinition))
        setDimensions(dimensionsResponse.items.map(mapDimensionDefinition))
        setCatalogStatus("ready")
      })
      .catch((error) => {
        if (!isActive) {
          return
        }
        const message =
          error instanceof Error ? error.message : "Failed to load catalog data."
        setCatalogStatus("error")
        setCatalogError(message)
        setMetrics([])
        setDimensions([])
      })

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    if (!metrics.length) {
      return
    }
    setTiles((prev) => {
      if (prev.length === 0) {
        return seedTiles(metrics, resolveLayoutCols(activeBreakpoint))
      }
      const firstMetricKey = metrics[0]?.key ?? ""
      return prev.map((tile) => {
        let next = tile
        const definition = getTileDefinition(tile.vizType)
        const resolvedMetricKeys = tile.metricKeys?.length
          ? tile.metricKeys.filter((key) => metricsByKey.has(key))
          : []
        const maxMetrics = definition.data.maxMetrics
        const trimmedMetricKeys =
          typeof maxMetrics === "number"
            ? resolvedMetricKeys.slice(0, maxMetrics)
            : resolvedMetricKeys
        const metricKeys =
          trimmedMetricKeys.length || !firstMetricKey
            ? trimmedMetricKeys
            : [firstMetricKey]
        const resolvedGroupBy = definition.data.supportsGroupBy
          ? tile.groupBy?.length
            ? tile.groupBy.filter((key) => dimensionsByKey.has(key))
            : []
          : []
        if (
          metricKeys.join("|") !== (tile.metricKeys ?? []).join("|") ||
          resolvedGroupBy.join("|") !== (tile.groupBy ?? []).join("|")
        ) {
          next = { ...next, metricKeys, groupBy: resolvedGroupBy }
        }
        if (next !== tile) {
          return applyMinSize(next, resolveLayoutCols(activeBreakpoint))
        }
        return next
      })
    })
  }, [
    metrics,
    dimensions,
    metricsByKey,
    dimensionsByKey,
    activeBreakpoint,
    resolveLayoutCols,
  ])

  useEffect(() => {
    if (!activeDashboardId) {
      return
    }
    const trimmedName = dashboardName.trim()
    if (!trimmedName) {
      return
    }
    const normalizedDescription = dashboardDescription.trim()
    const lastSaved = metadataRef.current
    if (
      trimmedName === lastSaved.name &&
      normalizedDescription === lastSaved.description
    ) {
      return
    }
    const dashboardId = activeDashboardId
    const timeout = setTimeout(() => {
      void persistDraftChange(dashboardId, async () => {
        await updateDraftMetadata(dashboardApiBaseUrl, dashboardId, {
          name: trimmedName,
          description: normalizedDescription || null,
        })
        metadataRef.current = {
          name: trimmedName,
          description: normalizedDescription,
        }
      })
    }, 400)
    return () => clearTimeout(timeout)
  }, [
    activeDashboardId,
    dashboardApiBaseUrl,
    dashboardDescription,
    dashboardName,
    persistDraftChange,
  ])

  useEffect(() => {
    if (selectedTileId && tiles.some((tile) => tile.id === selectedTileId)) {
      return
    }
    setSelectedTileId(tiles[0]?.id ?? null)
  }, [tiles, selectedTileId])

  const selectedTile = tiles.find((tile) => tile.id === selectedTileId) ?? null
  const selectedSeries = selectedTile
    ? seriesByTileId[selectedTile.id] ?? []
    : []
  const isLayoutEditable = editMode && !isCompactView
  const layouts = useMemo(() => buildLayouts(tiles), [tiles])
  const dashboardConfig = useMemo<DashboardConfig>(() => ({ tiles }), [tiles])

  const openTilePicker = () => {
    if (!metrics.length) {
      return
    }
    setDashboardError(null)
    setTilePickerOpen(true)
  }

  const closeTilePicker = () => {
    setTilePickerOpen(false)
  }

  const startTileDraft = (vizType: VizType) => {
    if (!metrics.length) {
      return
    }
    const definition = getTileDefinition(vizType)
    const seeded = createTileConfig(
      metrics[0],
      { x: 0, y: Infinity, w: 6, h: 5 },
      createId("tile")
    )
    const draft: TileConfig = {
      ...seeded,
      vizType,
      dataSource: definition.data.source,
    }
    setPendingTile(draft)
    setConfiguratorMode("create")
    setConfiguratorOpen(true)
    setTilePickerOpen(false)
  }

  const addTile = () => {
    if (!metrics.length) {
      return
    }
    const newTile: TileConfig = createTileConfig(
      metrics[0],
      { x: 0, y: Infinity, w: 6, h: 5 },
      createId("tile")
    )
    const cols = resolveLayoutCols(activeBreakpoint)
    const sized = applyMinSize(newTile, cols)
    const nextTiles = packTiles([...tilesRef.current, sized], cols)
    setTiles(nextTiles)
    setSelectedTileId(sized.id)
    const dashboardId = activeDashboardIdRef.current
    if (dashboardId) {
      const createdTile =
        nextTiles.find((tile) => tile.id === sized.id) ?? sized
      void persistDraftChange(dashboardId, async () => {
        await createDraftTile(dashboardApiBaseUrl, dashboardId, createdTile)
      })
      scheduleLayoutPersist(dashboardId, nextTiles)
    }
  }

  const addTileFromDraft = (tile: TileConfig) => {
    const cols = resolveLayoutCols(activeBreakpoint)
    const seeded = {
      ...tile,
      layout: { ...tile.layout, y: Infinity },
    }
    const sized = applyMinSize(seeded, cols)
    const nextTiles = packTiles([...tilesRef.current, sized], cols)
    setTiles(nextTiles)
    setSelectedTileId(sized.id)
    const dashboardId = activeDashboardIdRef.current
    if (dashboardId) {
      const createdTile =
        nextTiles.find((entry) => entry.id === sized.id) ?? sized
      void persistDraftChange(dashboardId, async () => {
        await createDraftTile(dashboardApiBaseUrl, dashboardId, createdTile)
      })
      scheduleLayoutPersist(dashboardId, nextTiles)
    }
  }

  const duplicateTile = (tileId: string) => {
    const source = tilesRef.current.find((tile) => tile.id === tileId)
    if (!source) {
      return
    }
    const copy: TileConfig = {
      ...source,
      id: createId("tile"),
      title: `${source.title} copy`,
      layout: { ...source.layout, y: Infinity },
    }
    const cols = resolveLayoutCols(activeBreakpoint)
    const sized = applyMinSize(copy, cols)
    const nextTiles = packTiles([...tilesRef.current, sized], cols)
    setTiles(nextTiles)
    setSelectedTileId(sized.id)
    const dashboardId = activeDashboardIdRef.current
    if (dashboardId) {
      const createdTile =
        nextTiles.find((tile) => tile.id === sized.id) ?? sized
      void persistDraftChange(dashboardId, async () => {
        await createDraftTile(dashboardApiBaseUrl, dashboardId, createdTile)
      })
      scheduleLayoutPersist(dashboardId, nextTiles)
    }
  }

  const removeTile = (tileId: string) => {
    const cols = resolveLayoutCols(activeBreakpoint)
    const remaining = tilesRef.current.filter((tile) => tile.id !== tileId)
    const nextTiles = packTiles(remaining, cols)
    setTiles(nextTiles)
    setSelectedTileId((prev) => {
      if (prev !== tileId) {
        return prev
      }
      return nextTiles[0]?.id ?? null
    })
    setSeriesByTileId((prev) => {
      if (!prev[tileId]) {
        return prev
      }
      const next = { ...prev }
      delete next[tileId]
      return next
    })
    const dashboardId = activeDashboardIdRef.current
    if (dashboardId) {
      void persistDraftChange(dashboardId, async () => {
        await deleteDraftTile(dashboardApiBaseUrl, dashboardId, tileId)
      })
      scheduleLayoutPersist(dashboardId, nextTiles)
    }
  }

  const updateTile = (tileId: string, updates: Partial<TileConfig>) => {
    const cols = resolveLayoutCols(activeBreakpoint)
    const source = tilesRef.current.find((tile) => tile.id === tileId)
    if (!source) {
      return
    }
    const nextTile = applyMinSize({ ...source, ...updates }, cols)
    setTiles((prev) =>
      prev.map((tile) => (tile.id === tileId ? nextTile : tile))
    )
    const dashboardId = activeDashboardIdRef.current
    if (dashboardId) {
      void persistDraftChange(dashboardId, async () => {
        await updateDraftTile(dashboardApiBaseUrl, dashboardId, tileId, nextTile)
      })
    }
  }

  const commitLayout = (layout: Layout) => {
    const cols = resolveLayoutCols(activeBreakpoint)
    const layoutById = new Map(layout.map((item) => [item.i, item]))
    const tileById = new Map(tilesRef.current.map((tile) => [tile.id, tile]))
    const orderedIds = [...layout]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((item) => item.i)
    const orderedTiles = orderedIds
      .map((id) => {
        const tile = tileById.get(id)
        const item = layoutById.get(id)
        if (!tile || !item) {
          return tile ?? null
        }
        return {
          ...tile,
          layout: { ...tile.layout, w: item.w, h: item.h },
        }
      })
      .filter((tile): tile is TileConfig => Boolean(tile))
    const remainingTiles = tilesRef.current
      .filter((tile) => !layoutById.has(tile.id))
      .map((tile) => {
        const item = layoutById.get(tile.id)
        if (!item) {
          return tile
        }
        return {
          ...tile,
          layout: { ...tile.layout, w: item.w, h: item.h },
        }
      })
    const nextTiles = packTiles([...orderedTiles, ...remainingTiles], cols)
    setTiles(nextTiles)
    const dashboardId = activeDashboardIdRef.current
    if (dashboardId) {
      scheduleLayoutPersist(dashboardId, nextTiles)
    }
  }

  const handleDashboardSelect = (value: string) => {
    if (!value || value === activeDashboardId) {
      return
    }
    setDashboardError(null)
    setIsRenaming(false)
    setActiveDashboardId(value)
    void loadDashboard(value)
  }

  const handleRefreshDashboard = () => {
    performRefresh()
  }

  const openCreateModal = () => {
    setDashboardError(null)
    setIsRenaming(false)
    setCreateName(dashboardName.trim() || "Killer Metric Studio")
    setCreateDescription(dashboardDescription)
    setCreateModalOpen(true)
  }

  const closeConfigurator = () => {
    setConfiguratorOpen(false)
    if (configuratorMode === "create") {
      setPendingTile(null)
      setConfiguratorMode("edit")
    }
  }

  const handleConfigureTile = (tileId: string) => {
    setDashboardError(null)
    setConfiguratorMode("edit")
    setPendingTile(null)
    setSelectedTileId(tileId)
    setConfiguratorOpen(true)
  }

  const commitConfiguratorTile = (tileId: string, updates: Partial<TileConfig>) => {
    if (configuratorMode === "create") {
      addTileFromDraft(updates as TileConfig)
      setPendingTile(null)
      setConfiguratorMode("edit")
      return
    }
    updateTile(tileId, updates)
  }

  const handleBackToTilePicker = () => {
    setConfiguratorOpen(false)
    setPendingTile(null)
    setConfiguratorMode("edit")
    setTilePickerOpen(true)
  }

  const openDeleteModal = () => {
    if (!activeDashboardId) {
      return
    }
    setDashboardError(null)
    setDeleteTarget({ id: activeDashboardId, name: dashboardName })
    setDeleteModalOpen(true)
  }

  const closeDeleteModal = () => {
    setDeleteModalOpen(false)
    setDeleteTarget(null)
  }

  const handleSaveDashboard = async () => {
    if (!activeDashboardId) {
      setDashboardStatus("error")
      setDashboardError("Select a dashboard to save.")
      return
    }
    if (!hasDraft) {
      setDashboardStatus("error")
      setDashboardError("No draft changes to save.")
      return
    }
    setDashboardStatus("saving")
    setDashboardError(null)
    try {
      const response = await commitDraft(dashboardApiBaseUrl, activeDashboardId)
      applyDashboardMetadata(response.name, response.description)
      setHasDraft(false)
      setDraftStatus("idle")
      setDraftError(null)
      setDashboards((prev) =>
        prev.map((item) =>
          item.id === response.id
            ? {
                ...item,
                name: response.name,
                description: response.description ?? null,
                updated_at: response.updated_at,
              }
            : item
        )
      )
      setIsRenaming(false)
      setDashboardStatus("idle")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save dashboard."
      setDashboardStatus("error")
      setDashboardError(message)
    }
  }

  const handleDiscardDraft = async () => {
    if (!activeDashboardId) {
      setDashboardStatus("error")
      setDashboardError("Select a dashboard to undo changes.")
      return
    }
    if (!hasDraft) {
      setDashboardStatus("error")
      setDashboardError("No draft changes to undo.")
      return
    }
    setDashboardStatus("loading")
    setDashboardError(null)
    setDraftError(null)
    setConfiguratorOpen(false)
    try {
      await deleteDraft(dashboardApiBaseUrl, activeDashboardId)
      await loadDashboard(activeDashboardId)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to discard draft."
      setDashboardStatus("error")
      setDashboardError(message)
    }
  }

  const handleDeleteDashboard = async () => {
    if (!deleteTarget) {
      return
    }
    setDashboardStatus("loading")
    setDashboardError(null)
    try {
      await deleteDashboard(dashboardApiBaseUrl, deleteTarget.id)
      closeDeleteModal()
      await refreshDashboards()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete dashboard."
      setDashboardStatus("error")
      setDashboardError(message)
    }
  }

  const handleCreateDashboard = async () => {
    const name = createName.trim()
    if (!name) {
      setDashboardStatus("error")
      setDashboardError("Dashboard name is required.")
      return
    }
    setDashboardStatus("saving")
    setDashboardError(null)
    try {
      const response = await createDashboard(dashboardApiBaseUrl, {
        name,
        description: createDescription.trim() || undefined,
        config: dashboardConfig,
      })
      setActiveDashboardId(response.id)
      applyDashboardMetadata(response.name, response.description)
      setHasDraft(false)
      setDraftStatus("idle")
      setDraftError(null)
      setDashboards((prev) => [
        {
          id: response.id,
          name: response.name,
          description: response.description ?? null,
          updated_at: response.updated_at,
        },
        ...prev.filter((item) => item.id !== response.id),
      ])
      setIsRenaming(false)
      setCreateModalOpen(false)
      setDashboardStatus("idle")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create dashboard."
      setDashboardStatus("error")
      setDashboardError(message)
    }
  }

  const toggleEditMode = () => {
    setEditMode((prev) => !prev)
  }

  return {
    tiles,
    selectedTileId,
    editMode,
    activeBreakpoint,
    metrics,
    dimensions,
    catalogStatus,
    catalogError,
    dashboards,
    activeDashboardId,
    dashboardName,
    dashboardDescription,
    dashboardStatus,
    dashboardError,
    hasDraft,
    draftStatus,
    draftError,
    refreshIntervalMs,
    seriesByTileId,
    isRenaming,
    createModalOpen,
    createName,
    createDescription,
    deleteModalOpen,
    deleteTarget,
    configuratorOpen,
    configuratorMode,
    tilePickerOpen,
    pendingTile,
    isCompactView,
    metricsByKey,
    dimensionsByKey,
    selectedTile,
    selectedSeries,
    isLayoutEditable,
    layouts,
    dashboardApiBaseUrl,
    setActiveBreakpoint,
    setSelectedTileId,
    setDashboardName,
    setDashboardDescription,
    setIsRenaming,
    setCreateName,
    setCreateDescription,
    setCreateModalOpen,
    setDeleteModalOpen,
    setConfiguratorOpen,
    setRefreshIntervalMs,
    addTile,
    openTilePicker,
    closeTilePicker,
    startTileDraft,
    duplicateTile,
    removeTile,
    updateTile,
    commitConfiguratorTile,
    commitLayout,
    handleDashboardSelect,
    handleRefreshDashboard,
    openCreateModal,
    openDeleteModal,
    closeDeleteModal,
    handleSaveDashboard,
    handleDiscardDraft,
    handleDeleteDashboard,
    handleCreateDashboard,
    toggleEditMode,
    handleConfigureTile,
    closeConfigurator,
    handleBackToTilePicker,
    handleSeriesChange,
  }
}
