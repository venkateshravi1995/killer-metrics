import type { AxisLabelMode, LegendPosition, Orientation } from "../../base-types"
import type { BaseTileConfig } from "../../tile-config"

export type BarTileVisuals = {
  palette: string
  seriesColors: Record<string, string>
  showLegend: boolean
  legendPosition: LegendPosition
  showGrid: boolean
  orientation: Orientation
  barRadius: number
  barGap: number
  xAxisLabelMode: AxisLabelMode
  xAxisLabelAngle: number
}

export type BarTileConfig = BaseTileConfig<BarTileVisuals> & { vizType: "bar" }

export const barVisualDefaults: BarTileVisuals = {
  palette: "lagoon",
  seriesColors: {},
  showLegend: false,
  legendPosition: "top",
  showGrid: true,
  orientation: "vertical",
  barRadius: 6,
  barGap: 12,
  xAxisLabelMode: "auto",
  xAxisLabelAngle: 0,
}
