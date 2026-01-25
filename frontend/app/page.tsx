import { Suspense } from "react"

import DashboardBuilder from "@/components/dashboard/builder"
import {
  fetchDashboard,
  fetchDashboards,
  fetchDimensions,
  fetchMetrics,
  normalizeDashboardBaseUrl,
} from "@/components/dashboard/api"
import { tileDefaults } from "@/components/dashboard/data"
import {
  mapDimensionDefinition,
  mapMetricDefinition,
} from "@/components/dashboard/builder/utils"

export const dynamic = "force-dynamic"

async function DashboardBootstrap() {
  const [metricsResponse, dimensionsResponse, dashboardsResponse] =
    await Promise.all([
      fetchMetrics(tileDefaults.apiBaseUrl),
      fetchDimensions(tileDefaults.apiBaseUrl),
      fetchDashboards(normalizeDashboardBaseUrl(""), { limit: 200 }),
    ])

  const metrics = metricsResponse.items.map(mapMetricDefinition)
  const dimensions = dimensionsResponse.items.map(mapDimensionDefinition)
  const dashboards = dashboardsResponse.items
  const activeDashboard = dashboards.length
    ? await fetchDashboard(normalizeDashboardBaseUrl(""), dashboards[0].id)
    : undefined

  return (
    <DashboardBuilder
      initialData={{
        metrics,
        dimensions,
        dashboards,
        activeDashboard,
      }}
    />
  )
}

export default function Home() {
  return (
    <Suspense fallback={<div className="app-shell flex min-h-screen flex-col" />}>
      <DashboardBootstrap />
    </Suspense>
  )
}
