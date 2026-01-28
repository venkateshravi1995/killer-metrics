import type { AxisLabelMode, LegendPosition } from "../../base-types"
import type { BaseTileConfig } from "../../tile-config"

export type AreaTileVisuals = {
  palette: string
  seriesColors: Record<string, string>
  lineWidth: number
  showLegend: boolean
  legendPosition: LegendPosition
  showGrid: boolean
  smooth: boolean
  showComparison: boolean
  showPoints: boolean
  lineStyle: "solid" | "dashed"
  xAxisLabelMode: AxisLabelMode
  xAxisLabelAngle: number
}

export type AreaTileConfig = BaseTileConfig<AreaTileVisuals> & { vizType: "area" }

export const areaVisualDefaults: AreaTileVisuals = {
  palette: "lagoon",
  seriesColors: {},
  lineWidth: 2,
  showLegend: false,
  legendPosition: "top",
  showGrid: true,
  smooth: true,
  showComparison: false,
  showPoints: false,
  lineStyle: "solid",
  xAxisLabelMode: "auto",
  xAxisLabelAngle: 0,
}
