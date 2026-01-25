import type { VizType } from "../types"

import { areaTileDefinition } from "./area"
import { barTileDefinition } from "./bar"
import { donutTileDefinition } from "./donut"
import { kpiTileDefinition } from "./kpi"
import { lineTileDefinition } from "./line"
import { tableTileDefinition } from "./table"
import type { TileDefinition } from "./types"

const tileDefinitions: TileDefinition[] = [
  lineTileDefinition,
  areaTileDefinition,
  barTileDefinition,
  donutTileDefinition,
  tableTileDefinition,
  kpiTileDefinition,
]

const tileDefinitionMap = new Map<VizType, TileDefinition>(
  tileDefinitions.map((definition) => [definition.type, definition])
)

export function getTileDefinition(type: VizType) {
  return tileDefinitionMap.get(type) ?? lineTileDefinition
}

export function getTileDefinitions() {
  return tileDefinitions
}
