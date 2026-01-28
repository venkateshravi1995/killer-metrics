import type { BaseTileConfig } from "../../tile-config"

export type KpiDeltaMode = "percent" | "value" | "both"

export type KpiValueMode = "current" | "average" | "min" | "max" | "sum" | "first"

export type KpiSecondaryValue =
  | "none"
  | "previous"
  | "average"
  | "min"
  | "max"
  | "sum"
  | "first"

export type KpiDeltaBasis = "previous" | "first" | "average"

export type KpiDeltaStyle = "badge" | "inline"

export type KpiAlignment = "left" | "center"

export type KpiValueSize = "lg" | "xl"

export type KpiTileVisuals = {
  palette: string
  lineWidth: number
  smooth: boolean
  showComparison: boolean
  kpiDeltaMode: KpiDeltaMode
  kpiValueMode: KpiValueMode
  kpiSecondaryValue: KpiSecondaryValue
  kpiDeltaBasis: KpiDeltaBasis
  kpiShowDelta: boolean
  kpiDeltaStyle: KpiDeltaStyle
  kpiShowLabel: boolean
  kpiAlignment: KpiAlignment
  kpiValueSize: KpiValueSize
}

export type KpiTileConfig = BaseTileConfig<KpiTileVisuals> & { vizType: "kpi" }

export const kpiVisualDefaults: KpiTileVisuals = {
  palette: "lagoon",
  lineWidth: 2,
  smooth: true,
  showComparison: false,
  kpiDeltaMode: "percent",
  kpiValueMode: "current",
  kpiSecondaryValue: "none",
  kpiDeltaBasis: "previous",
  kpiShowDelta: true,
  kpiDeltaStyle: "badge",
  kpiShowLabel: true,
  kpiAlignment: "left",
  kpiValueSize: "lg",
}
