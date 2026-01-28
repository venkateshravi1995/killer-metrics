import type { LegendPosition } from "../../base-types"
import type { BaseTileConfig } from "../../tile-config"

export type DonutLabelMode = "name" | "value" | "percent" | "name_percent"

export type DonutLabelPosition = "inside" | "outside"

export type DonutTileVisuals = {
  palette: string
  seriesColors: Record<string, string>
  showLegend: boolean
  legendPosition: LegendPosition
  showDataLabels: boolean
  donutLabelMode: DonutLabelMode
  donutLabelPosition: DonutLabelPosition
  donutInnerRadius: number
  donutOuterRadius: number
  donutSlicePadding: number
}

export type DonutTileConfig = BaseTileConfig<DonutTileVisuals> & { vizType: "donut" }

export const donutVisualDefaults: DonutTileVisuals = {
  palette: "lagoon",
  seriesColors: {},
  showLegend: false,
  legendPosition: "top",
  showDataLabels: false,
  donutLabelMode: "name_percent",
  donutLabelPosition: "outside",
  donutInnerRadius: 55,
  donutOuterRadius: 85,
  donutSlicePadding: 2,
}
