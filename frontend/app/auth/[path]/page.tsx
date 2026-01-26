"use client"

import type { CSSProperties } from "react"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { AuthView } from "@neondatabase/neon-js/auth/react/ui"
import { useParams } from "next/navigation"

import { NeonAuthProvider } from "@/components/auth/neon-auth-provider"
import styles from "../auth.module.css"

type ChartType =
  | "line"
  | "area"
  | "bars"
  | "hbars"
  | "pie"
  | "donut"
  | "radar"
  | "kpi"

type TileSize = "wide" | "tall" | "xl"

type Tile = {
  id: string
  title: string
  type: ChartType
  unit: string
  value: number
  delta: number
  accent: string
  accentSoft: string
  series: number[]
  segments: number[]
  radar: number[]
  size?: TileSize
}

const chartTypes: ChartType[] = [
  "line",
  "area",
  "bars",
  "hbars",
  "pie",
  "donut",
  "radar",
  "kpi",
]

const labelPool = [
  "North star growth",
  "Qualified leads",
  "Activation lift",
  "Infra response",
  "Engagement rate",
  "Pipeline velocity",
  "Cache warmth",
  "Signal depth",
  "Risk surface",
  "Deploy cadence",
  "Revenue glow",
  "Latency pulse",
  "Churn drift",
  "Onboarding flow",
  "Edge routing",
  "Query burst",
  "Uptime line",
  "Trend strength",
  "Session density",
  "Forecast band",
]

const unitPool = ["%", "ms", "k", "x", " req/s"]

const MAX_TILES = 24
const EXTRA_TILES = 4
const UPDATE_INTERVAL_MS = 9000
const UPDATE_BATCH_SIZE = 3

const palette = [
  { accent: "#14b8a6", soft: "rgba(20, 184, 166, 0.22)" },
  { accent: "#38bdf8", soft: "rgba(56, 189, 248, 0.22)" },
  { accent: "#f97316", soft: "rgba(249, 115, 22, 0.24)" },
  { accent: "#84cc16", soft: "rgba(132, 204, 22, 0.22)" },
  { accent: "#f43f5e", soft: "rgba(244, 63, 94, 0.22)" },
]

const mulberry32 = (seed: number) => {
  let t = seed
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), t | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const normalizeSegments = (values: number[]) => {
  const total = values.reduce((sum, item) => sum + item, 0) || 1
  return values.map((value) => (value / total) * 100)
}

const buildSpark = (rand: () => number, length = 12, base = 50) =>
  Array.from({ length }, (_, index) =>
    base + Math.sin(index * 0.7 + rand() * 3) * 18 + (rand() - 0.5) * 10
  )

const buildRadar = (rand: () => number, length = 6) =>
  Array.from({ length }, () => 30 + rand() * 70)

const buildSegments = (rand: () => number) =>
  normalizeSegments([20 + rand() * 40, 15 + rand() * 35, 10 + rand() * 30])

const buildTile = (rand: () => number, index: number): Tile => {
  const paletteItem = palette[index % palette.length]
  const type = chartTypes[Math.floor(rand() * chartTypes.length)]
  const unit = unitPool[Math.floor(rand() * unitPool.length)]
  const base =
    unit === "%"
      ? 60 + rand() * 35
      : unit === "ms"
        ? 90 + rand() * 160
        : unit === "k"
          ? 4 + rand() * 38
          : unit === " req/s"
            ? 1 + rand() * 8
            : 1.4 + rand() * 4.2
  const sizeRoll = rand()
  const size: TileSize | undefined =
    sizeRoll > 0.92 ? "xl" : sizeRoll > 0.76 ? "wide" : sizeRoll < 0.12 ? "tall" : undefined

  return {
    id: `tile-${index}-${Math.floor(rand() * 10000)}`,
    title: labelPool[Math.floor(rand() * labelPool.length)],
    type,
    unit,
    value: base,
    delta: (rand() - 0.5) * base * 0.04,
    accent: paletteItem.accent,
    accentSoft: paletteItem.soft,
    series: buildSpark(rand, 12, base),
    segments: buildSegments(rand),
    radar: buildRadar(rand),
    size,
  }
}

const updateTile = (tile: Tile) => {
  const drift = (Math.random() - 0.5) * 6
  const nextValue = clamp(tile.value + drift, 1, 999)
  const nextDelta = nextValue - tile.value
  const series =
    tile.type === "line" || tile.type === "area"
      ? [...tile.series.slice(1), nextValue + (Math.random() - 0.5) * 8]
      : tile.series
  const segments =
    tile.type === "pie" || tile.type === "donut"
      ? normalizeSegments(tile.segments.map((value) => clamp(value + (Math.random() - 0.5) * 6, 8, 80)))
      : tile.segments
  const radar = tile.type === "radar" ? buildRadar(Math.random, tile.radar.length) : tile.radar

  return {
    ...tile,
    value: nextValue,
    delta: nextDelta,
    series,
    segments,
    radar,
  }
}

const buildSparklinePoints = (values: number[]) => {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100
      const y = 100 - ((value - min) / range) * 100
      return `${x},${y}`
    })
    .join(" ")
}

const buildAreaPath = (values: number[]) => {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = 100 / (values.length - 1)
  const points = values.map((value, index) => {
    const x = index * step
    const y = 90 - ((value - min) / range) * 70
    return { x, y }
  })
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")
  return `${line} L 100 100 L 0 100 Z`
}

const buildRadarPoints = (values: number[]) => {
  const step = (Math.PI * 2) / values.length
  const radius = 48
  const center = 60
  return values
    .map((value, index) => {
      const ratio = value / 100
      const angle = step * index - Math.PI / 2
      const x = center + Math.cos(angle) * radius * ratio
      const y = center + Math.sin(angle) * radius * ratio
      return `${x},${y}`
    })
    .join(" ")
}

const buildPieGradient = (segments: number[], accent: string, accentSoft: string) => {
  const stops = [] as string[]
  let current = 0
  const colors = [accent, accentSoft, "rgba(15, 23, 42, 0.12)"]
  segments.forEach((segment, index) => {
    const next = current + segment
    const color = colors[index % colors.length]
    stops.push(`${color} ${current}% ${next}%`)
    current = next
  })
  return stops.join(", ")
}

const formatValue = (tile: Tile) => {
  const raw = tile.unit === "ms" ? Math.round(tile.value) : tile.value.toFixed(1)
  return `${raw}${tile.unit}`
}

const formatDelta = (tile: Tile) => {
  const raw = tile.unit === "ms" ? Math.round(tile.delta) : tile.delta.toFixed(1)
  const sign = tile.delta >= 0 ? "+" : "-"
  return `${sign}${Math.abs(Number(raw))}${tile.unit}`
}

const getTileCount = (width: number, height: number, memoryClass: number) => {
  const columns = width < 640 ? 2 : width < 1024 ? 4 : 6
  const rows = Math.max(3, Math.ceil(height / 260))
  const memoryCap =
    memoryClass <= 2 ? 12 : memoryClass <= 4 ? 16 : memoryClass <= 8 ? 20 : MAX_TILES
  const count = Math.min(columns * rows, memoryCap)
  return { columns, count }
}

type TileCardProps = {
  tile: Tile
  iteration: number
  registerTile: (id: string) => (node: HTMLDivElement | null) => void
  isVisible: boolean
}

const TileCard = memo(({ tile, iteration, registerTile, isVisible }: TileCardProps) => {
  const sizeClass = tile.size
    ? tile.size === "wide"
      ? styles.tileWide
      : tile.size === "tall"
        ? styles.tileTall
        : styles.tileXL
    : ""
  const badgeClass = tile.delta < 0 ? `${styles.badge} ${styles.badgeNegative}` : styles.badge
  const chartStyle: CSSProperties & Record<`--${string}`, string> = {
    "--accent": tile.accent,
    "--accent-soft": tile.accentSoft,
    "--pie": buildPieGradient(tile.segments, tile.accent, tile.accentSoft),
  }
  const showCharts = isVisible

  return (
    <div
      key={`${tile.id}-${iteration}`}
      className={`${styles.tile} ${sizeClass}`}
      style={chartStyle}
      data-base-id={tile.id}
      ref={registerTile(tile.id)}
    >
      <div className={styles.title}>
        <span>{tile.title}</span>
        <span className={badgeClass}>{formatDelta(tile)}</span>
      </div>
      {tile.type === "kpi" ? (
        <div className={styles.kpi}>
          <span className={styles.kpiBig}>{formatValue(tile)}</span>
          <span className={styles.kpiUnit}>KPI</span>
        </div>
      ) : (
        <div className={styles.value}>{formatValue(tile)}</div>
      )}
      <div className={styles.meta}>Live signal update</div>
      {showCharts && tile.type === "line" ? (
        <svg className={styles.sparkline} viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline points={buildSparklinePoints(tile.series)} />
          <circle cx="100" cy="40" r="3" />
        </svg>
      ) : null}
      {showCharts && tile.type === "area" ? (
        <svg className={styles.area} viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d={buildAreaPath(tile.series)} />
        </svg>
      ) : null}
      {showCharts && tile.type === "bars" ? (
        <div className={styles.bars}>
          {tile.series.slice(0, 9).map((value, idx) => (
            <span
              key={`${tile.id}-${idx}`}
              className={styles.bar}
              style={
                { height: `${30 + (value % 60)}%`, "--delay": `${idx * 0.2}s` } as CSSProperties
              }
            />
          ))}
        </div>
      ) : null}
      {showCharts && tile.type === "hbars" ? (
        <div className={styles.hbars}>
          {tile.series.slice(0, 5).map((value, idx) => (
            <div key={`${tile.id}-h-${idx}`} className={styles.hbar}>
              <div className={styles.hbarFill} style={{ width: `${30 + (value % 70)}%` }} />
            </div>
          ))}
        </div>
      ) : null}
      {showCharts && (tile.type === "pie" || tile.type === "donut") ? (
        <div className={styles.chartRow}>
          <div>
            <div className={styles.meta}>Segments</div>
            <div className={styles.value}>{Math.round(tile.segments[0])}%</div>
          </div>
          <div className={`${styles.pie} ${tile.type === "donut" ? styles.donut : ""}`}>
            <span>{Math.round(tile.segments[1])}%</span>
          </div>
        </div>
      ) : null}
      {showCharts && tile.type === "radar" ? (
        <svg className={styles.radar} viewBox="0 0 120 120" preserveAspectRatio="xMidYMid meet">
          <polygon points={buildRadarPoints(tile.radar)} />
        </svg>
      ) : null}
    </div>
  )
})

TileCard.displayName = "TileCard"

export default function AuthPage() {
  const params = useParams<{ path?: string | string[] }>()
  const paramValue = params?.path
  const authPath =
    typeof paramValue === "string"
      ? paramValue
      : Array.isArray(paramValue)
        ? paramValue[0]
        : "sign-in"

  const [mounted, setMounted] = useState(false)
  const [tiles, setTiles] = useState<Tile[]>([])
  const [columns, setColumns] = useState(6)
  const [repeatCount, setRepeatCount] = useState(2)
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const visibleCounts = useRef(new Map<string, number>())
  const updateCursorRef = useRef(0)
  const visibleIdsRef = useRef<Set<string>>(new Set())
  const prefersReducedMotion = useRef(false)
  const memoryClass = useRef(8)

  useEffect(() => {
    setMounted(true)
    const seed = Math.floor(Date.now() / 1000)
    const rand = mulberry32(seed)
    const nav = navigator as Navigator & { deviceMemory?: number }
    memoryClass.current = nav.deviceMemory ?? 8

    const buildTilesForViewport = () => {
      const { columns: nextColumns, count } = getTileCount(
        window.innerWidth,
        window.innerHeight,
        memoryClass.current
      )
      setColumns(nextColumns)
      setRepeatCount(window.innerWidth < 1024 ? 1 : 2)
      const nextTiles = Array.from(
        { length: count + EXTRA_TILES },
        (_, index) => buildTile(rand, index)
      )
      setTiles(nextTiles)
    }

    buildTilesForViewport()
    prefersReducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const handleResize = () => buildTilesForViewport()
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  useEffect(() => {
    if (!mounted) return
    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.getAttribute("data-base-id")
          if (!id) return
          const current = visibleCounts.current.get(id) ?? 0
          const next = entry.isIntersecting ? current + 1 : Math.max(0, current - 1)
          if (next === 0) {
            visibleCounts.current.delete(id)
          } else {
            visibleCounts.current.set(id, next)
          }
        })
        const next = new Set(visibleCounts.current.keys())
        const prev = visibleIdsRef.current
        const isSameSize = next.size === prev.size
        const isSame = isSameSize && Array.from(next).every((id) => prev.has(id))
        if (!isSame) {
          visibleIdsRef.current = next
          setVisibleIds(next)
        }
      },
      { threshold: 0.2, rootMargin: "120px" }
    )

    return () => observerRef.current?.disconnect()
  }, [mounted, tiles.length])

  const registerTile = useCallback((id: string) => {
    let current: Element | null = null
    return (node: HTMLDivElement | null) => {
      const observer = observerRef.current
      if (!observer) return
      if (current) {
        observer.unobserve(current)
      }
      if (node) {
        observer.observe(node)
        current = node
      } else {
        current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!mounted) return
    if (prefersReducedMotion.current) return
    const interval = setInterval(() => {
      if (document.hidden || visibleIds.size === 0) return
      const update = () => {
        setTiles((prev) => {
          const visibleList = prev.filter((tile) => visibleIds.has(tile.id))
          if (!visibleList.length) return prev
          const start = updateCursorRef.current % visibleList.length
          const batch = visibleList
            .slice(start, start + UPDATE_BATCH_SIZE)
            .map((tile) => tile.id)
          updateCursorRef.current = start + UPDATE_BATCH_SIZE
          const batchSet = new Set(batch)
          return prev.map((tile) => (batchSet.has(tile.id) ? updateTile(tile) : tile))
        })
      }
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(update, { timeout: 1200 })
      } else {
        update()
      }
    }, UPDATE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [mounted, visibleIds])

  return (
    <NeonAuthProvider>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <span className={styles.topbarTitle}>Venky&apos;s Killer Metrics</span>
          <a
            className={styles.topbarLink}
            href="https://www.linkedin.com/in/veravi/"
            target="_blank"
            rel="noreferrer"
          >
            About me
          </a>
        </div>
        {mounted ? (
          <div className={styles.backdrop} aria-hidden="true">
            <div className={styles.aurora} />
            <div className={styles.grid} />
            <div className={styles.scroll} style={{ "--columns": columns } as CSSProperties}>
              <div className={styles.track}>
                {Array.from({ length: repeatCount }).map((_, iteration) => (
                  <div className={styles.metrics} key={`grid-${iteration}`}>
                    {tiles.map((tile) => (
                      <TileCard
                        key={`${tile.id}-${iteration}`}
                        tile={tile}
                        iteration={iteration}
                        registerTile={registerTile}
                        isVisible={visibleIds.has(tile.id)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        <div className={styles.overlay}>
          <div className={styles.cardWrap}>
            <div className={styles.authPanel}>
              <AuthView path={authPath} redirectTo="/" />
            </div>
          </div>
        </div>
      </div>
    </NeonAuthProvider>
  )
}
