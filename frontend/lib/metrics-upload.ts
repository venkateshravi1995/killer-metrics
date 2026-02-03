import { normalizeBaseUrl } from "@/components/dashboard/api"

export type MetricsUploadResponse = {
  rows: number
  metrics_upserted: number
  dimensions_upserted: number
  dimension_values_inserted: number
  dimension_sets_inserted: number
  metric_series_inserted: number
  metric_observations_inserted: number
}

export async function uploadMetricsCsv(
  file: File,
  baseUrl = ""
): Promise<MetricsUploadResponse> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/v1/metrics/upload`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  return (await response.json()) as MetricsUploadResponse
}
