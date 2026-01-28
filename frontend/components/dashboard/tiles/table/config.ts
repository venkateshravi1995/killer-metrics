import type { BaseTileConfig } from "../../tile-config"

export type TableTileVisuals = {
  palette: string
}

export type TableTileConfig = BaseTileConfig<TableTileVisuals> & { vizType: "table" }

export const tableVisualDefaults: TableTileVisuals = {
  palette: "lagoon",
}
