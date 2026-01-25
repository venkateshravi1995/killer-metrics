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
  - `palette`: Palette identifier.
  - `seriesColors`: Per-series override color map.
  - `showLegend`, `legendPosition` (`top`, `bottom`, `left`, `right`).
  - `showGrid` (chart grids), `showPoints` (line/area markers).
  - `smooth` (line/area curve type), `lineStyle` (`solid`/`dashed`), `lineWidth`.
  - `xAxisLabelMode` (`auto`/`short`/`full`), `xAxisLabelAngle`.
  - `orientation` (`vertical`/`horizontal`) for bar charts.
  - `barRadius`, `barGap` (bar charts).
  - `donutLabelMode` (`name`, `value`, `percent`, `name_percent`).
  - `donutLabelPosition` (`inside`, `outside`).
  - `donutInnerRadius`, `donutOuterRadius`, `donutSlicePadding`.
  - `kpiDeltaMode` (`percent`, `value`, `both`).

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
