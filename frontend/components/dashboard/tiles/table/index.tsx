"use client"

import { formatMetricValue, getPalette } from "../../data"
import { DefaultTileConfigurator } from "../configurator/default"
import type { TileConfiguratorComponent, TileDefinition, TileRenderProps } from "../types"

function TableTile({
  tile,
  metrics,
  primaryMetric,
  aggregates,
  groupByLabels,
}: TileRenderProps) {
  const palette = getPalette(tile.palette)
  const showShare = metrics.length === 1
  const dimensionKeys = tile.groupBy
  const rowsByKey = new Map<string, Record<string, string | number>>()
  const metricTotals = new Map<string, number>()

  aggregates.forEach((group) => {
    const dimensionValues = dimensionKeys.map((key) => group.dimensions[key] ?? "")
    const rowKey = dimensionValues.join("|") || "Total"
    const row = rowsByKey.get(rowKey) ?? {}
    dimensionValues.forEach((value, index) => {
      row[`dim_${index}`] = value || "Unknown"
    })
    row[`metric_${group.metricKey}`] = group.value
    rowsByKey.set(rowKey, row)
    metricTotals.set(
      group.metricKey,
      (metricTotals.get(group.metricKey) ?? 0) + group.value
    )
  })

  const rows = Array.from(rowsByKey.values())
  const totalPrimary = metricTotals.get(primaryMetric.key) ?? 0
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Breakdown by {groupByLabels.length ? groupByLabels.join(", ") : "All"}
      </div>
      <div className="flex-1 overflow-auto rounded-lg border border-border/60 bg-background/80">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background/95 text-muted-foreground">
            <tr>
              {dimensionKeys.length ? (
                dimensionKeys.map((_, index) => (
                  <th key={`dim_${index}`} className="px-3 py-2 text-left font-medium">
                    {groupByLabels[index] ?? `Dimension ${index + 1}`}
                  </th>
                ))
              ) : (
                <th className="px-3 py-2 text-left font-medium">Segment</th>
              )}
              {metrics.map((metric) => (
                <th key={metric.key} className="px-3 py-2 text-right font-medium">
                  {metric.label}
                </th>
              ))}
              {showShare ? (
                <th className="px-3 py-2 text-right font-medium">Share</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row_${rowIndex}`} className="border-t border-border/60">
                {dimensionKeys.length ? (
                  dimensionKeys.map((_, index) => (
                    <td key={`dim_${index}`} className="px-3 py-2 text-foreground">
                      {row[`dim_${index}`] as string}
                    </td>
                  ))
                ) : (
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex size-2 rounded-full"
                        style={{
                          backgroundColor:
                            palette.colors[rowIndex % palette.colors.length],
                        }}
                      />
                      <span className="text-foreground">Total</span>
                    </div>
                  </td>
                )}
                {metrics.map((metric) => (
                  <td
                    key={metric.key}
                    className="px-3 py-2 text-right font-medium text-foreground"
                  >
                    {formatMetricValue(
                      Number(row[`metric_${metric.key}`] ?? 0),
                      metric
                    )}
                  </td>
                ))}
                {showShare ? (
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {totalPrimary
                      ? `${Math.round(
                          (Number(row[`metric_${primaryMetric.key}`] ?? 0) /
                            totalPrimary) *
                            100
                        )}%`
                      : "0%"}
                  </td>
                ) : null}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(1, dimensionKeys.length) + metrics.length + (showShare ? 1 : 0)}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No breakdown data available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{rows.length} rows</span>
        <span>Total {formatMetricValue(totalPrimary, primaryMetric)}</span>
      </div>
    </div>
  )
}

const TableConfigurator: TileConfiguratorComponent = (props) => (
  <DefaultTileConfigurator {...props} />
)

export const tableTileDefinition: TileDefinition = {
  type: "table",
  label: "Table",
  description: "List grouped values with totals and shares.",
  minSize: { w: 4, h: 4 },
  data: {
    source: "aggregate",
    range: "required",
    supportsGroupBy: true,
    maxMetrics: undefined,
  },
  api: {
    method: "POST",
    endpoint: "/v1/query/aggregate",
    description: "Aggregated metric grouped by dimensions.",
  },
  visualOptions: {
    palette: true,
  },
  render: TableTile,
  configurator: TableConfigurator,
  getMinSize: (tile) => {
    const isFilteredBreakdown = tile.filters.some((filter) =>
      tile.groupBy.includes(filter.dimension)
    )
    const breakdownRows = isFilteredBreakdown ? 1 : 3
    const minH = Math.max(4, 3 + breakdownRows)
    return { minW: 4, minH }
  },
}
