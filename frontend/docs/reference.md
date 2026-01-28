# Frontend Reference

## Tile configuration model
Each tile is configured using the `TileConfig` model. Key fields include:

- **Identity & layout**
  - `id`: Stable tile identifier.
  - `title`, `description`, `notes`: User-facing text.
  - `layout`: `{ x, y, w, h }` grid position and size.
- **Data selection**
  - `metricKeys`: List of metric keys used by the tile.
  - `vizType`: Visualization type (see tile types below).
  - `dataSource`: `timeseries`, `aggregate`, or `kpi`.
  - `grain`: Time grain (`30m`, `hour`, `day`, `week`, `biweek`, `month`, `quarter`).
  - `startTime`, `endTime`: ISO timestamps (empty for “use available range”).
  - `groupBy`: Dimension keys for grouping.
  - `filters`: Dimension filter objects: `{ id, dimension, values }`.
- **Visual customization**
  - `visuals`: Tile-specific visual options object (varies by `vizType`).
  - Common fields include `visuals.palette`, `visuals.seriesColors`, `visuals.showLegend`, `visuals.legendPosition`.
  - Line/area/bar fields include `visuals.showGrid`, `visuals.showPoints`, `visuals.smooth`, `visuals.lineStyle`, `visuals.lineWidth`.
  - Axis fields include `visuals.xAxisLabelMode` (`auto`/`short`/`full`) and `visuals.xAxisLabelAngle`.
  - Bar fields include `visuals.orientation` (`vertical`/`horizontal`), `visuals.barRadius`, `visuals.barGap`.
  - Donut fields include `visuals.showDataLabels`, `visuals.donutLabelMode`, `visuals.donutLabelPosition`, `visuals.donutInnerRadius`, `visuals.donutOuterRadius`, `visuals.donutSlicePadding`.
  - KPI fields include `visuals.kpiDeltaMode` (`percent`, `value`, `both`) plus the KPI-specific controls.

## Tile types and customization options
The following tile types are available. Each tile’s customization options correspond to the visual options in its tile definition.

### Line
- **Purpose**: Trend a metric over time with a line chart.
- **Data**: `timeseries` (range required), supports group-by, supports `timeseries` + `aggregate` sources.
- **API**: `POST /v1/query/timeseries`
- **Customization options**:
  - Palette, series colors, line width, show legend, legend position, show grid, smooth lines, show comparison, show points, line style, axis labels.

### Area
- **Purpose**: Emphasize volume trends with a filled area chart.
- **Data**: `timeseries` (range required), supports group-by, supports `timeseries` + `aggregate` sources.
- **API**: `POST /v1/query/timeseries`
- **Customization options**:
  - Palette, series colors, line width, show legend, legend position, show grid, smooth lines, show comparison, show points, line style, axis labels.

### Bar
- **Purpose**: Compare values across time buckets with bars.
- **Data**: `timeseries` (range required), supports group-by, supports `timeseries` + `aggregate` sources.
- **API**: `POST /v1/query/timeseries`
- **Customization options**:
  - Palette, series colors, show legend, legend position, show grid, orientation, bar radius, bar gap, axis labels.

### Donut
- **Purpose**: Show a proportional breakdown using a donut chart.
- **Data**: `aggregate` (range required), supports group-by, max 1 metric.
- **API**: `POST /v1/query/aggregate`
- **Customization options**:
  - Palette, series colors, show legend, legend position, show data labels, donut label mode, donut label position, inner/outer radius, slice padding.

### Table
- **Purpose**: List grouped values with totals and shares.
- **Data**: `aggregate` (range required), supports group-by.
- **API**: `POST /v1/query/aggregate`
- **Customization options**:
  - Palette.

### KPI
- **Purpose**: Highlight the latest value and change.
- **Data**: `kpi` (range optional), no group-by, max 1 metric.
- **API**: `POST /v1/query/timeseries` (falls back to latest if range is empty).
- **Customization options**:
  - Palette, line width, smooth sparkline, show comparison, KPI delta mode.
