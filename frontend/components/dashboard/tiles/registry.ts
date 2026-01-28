import type { VizType } from "../types"

import { areaTileDefinition } from "./area"
import { barTileDefinition } from "./bar"
import { donutTileDefinition } from "./donut"
import { kpiTileDefinition } from "./kpi"
import { lineTileDefinition } from "./line"
import { tableTileDefinition } from "./table"
import type { TileDefinition } from "./types"
import type { TileConfig } from "../types"

const tileDefinitions: TileDefinition<TileConfig>[] = [
  lineTileDefinition as TileDefinition<TileConfig>,
  areaTileDefinition as TileDefinition<TileConfig>,
  barTileDefinition as TileDefinition<TileConfig>,
  donutTileDefinition as TileDefinition<TileConfig>,
  tableTileDefinition as TileDefinition<TileConfig>,
  kpiTileDefinition as TileDefinition<TileConfig>,
]

const tileDefinitionMap = new Map<VizType, TileDefinition<TileConfig>>(
  tileDefinitions.map((definition) => [definition.type, definition])
)

export function getTileDefinition(type: VizType) {
  return tileDefinitionMap.get(type) ?? lineTileDefinition
}

export function getTileDefinitions() {
  return tileDefinitions
}
