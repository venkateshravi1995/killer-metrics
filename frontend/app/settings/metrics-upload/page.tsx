"use client"

import { useState, type FormEvent } from "react"

import { uploadMetricsCsv } from "@/lib/metrics-upload"
import type { MetricsUploadResponse } from "@/lib/metrics-upload"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

const REQUIRED_COLUMNS = [
  "metric_key",
  "metric_name",
  "metric_description",
  "metric_type",
  "unit",
  "directionality",
  "aggregation",
  "grain",
  "time_start_ts",
  "time_end_ts",
  "value_num",
  "sample_size",
  "is_estimated",
]

const DIMENSION_EXAMPLES = ["geo", "channel", "product"]

export default function MetricsUploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MetricsUploadResponse | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setResult(null)
    if (!file) {
      setError("Select a CSV file to upload.")
      return
    }
    setIsSubmitting(true)
    try {
      const response = await uploadMetricsCsv(file)
      setResult(response)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed."
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell min-h-screen">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
            Settings
          </p>
          <h1 className="font-display text-3xl font-semibold">
            Metrics Upload
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload a CSV file to validate the column layout and load metric
            observations into the database.
          </p>
        </header>

        <Card className="border-primary/20 bg-card/80 shadow-xl">
          <CardHeader>
            <CardTitle>Upload CSV</CardTitle>
            <CardDescription>
              The CSV is validated with pandas before ingestion.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) =>
                  setFile(event.target.files ? event.target.files[0] : null)
                }
              />
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Uploading..." : "Upload Metrics"}
                </Button>
                {file ? (
                  <span className="text-sm text-muted-foreground">
                    Selected: {file.name}
                  </span>
                ) : null}
              </div>
            </form>
            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {result ? (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                <p className="font-medium text-primary">
                  Upload complete. {result.rows} rows processed.
                </p>
                <div className="mt-2 grid gap-1 text-muted-foreground">
                  <span>Metrics upserted: {result.metrics_upserted}</span>
                  <span>Dimensions upserted: {result.dimensions_upserted}</span>
                  <span>
                    Dimension values inserted:{" "}
                    {result.dimension_values_inserted}
                  </span>
                  <span>
                    Dimension sets inserted: {result.dimension_sets_inserted}
                  </span>
                  <span>Metric series inserted: {result.metric_series_inserted}</span>
                  <span>
                    Observations inserted: {result.metric_observations_inserted}
                  </span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Required Columns</CardTitle>
            <CardDescription>
              Each CSV must include these columns. Extra columns become
              dimensions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {REQUIRED_COLUMNS.map((column) => (
                <Badge key={column} variant="secondary">
                  {column}
                </Badge>
              ))}
            </div>
            <Separator />
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                Dimension column examples
              </p>
              <div className="flex flex-wrap gap-2">
                {DIMENSION_EXAMPLES.map((column) => (
                  <Badge key={column} variant="outline">
                    {column}
                  </Badge>
                ))}
              </div>
              <p>
                You can include any number of dimension columns; each distinct
                value is stored as a dimension value.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
