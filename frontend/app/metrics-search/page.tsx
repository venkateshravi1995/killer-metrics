"use client"

import { useMemo, useState } from "react"
import { Filter, Search, Sparkles } from "lucide-react"

import { normalizeBaseUrl, type MetricCatalogItem } from "@/components/dashboard/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingOrbit, LoadingOverlay } from "@/components/ui/loading-indicator"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"

type SearchField = "metric_name" | "metric_description" | "metric_type"

type MetricSearchFilters = {
  metric_key?: string[]
  metric_name?: string[]
  metric_type?: string[]
  unit?: string[]
  directionality?: string[]
  aggregation?: string[]
  is_active?: boolean[]
}

type MetricsSearchResponse = {
  items: MetricCatalogItem[]
  limit: number
  offset: number
}

const SEARCH_FIELDS: Array<{ id: SearchField; label: string }> = [
  { id: "metric_name", label: "Name" },
  { id: "metric_description", label: "Description" },
  { id: "metric_type", label: "Type" },
]

const METRIC_TYPES = ["count", "ratio", "sum", "avg", "rate"] as const
const AGGREGATIONS = ["sum", "avg", "min", "max", "count"] as const
const UNITS = ["usd", "percent", "count", "seconds", "ms"] as const
const DIRECTIONALITY = ["higher", "lower", "neutral"] as const

const DEFAULT_FIELDS: SearchField[] = [
  "metric_name",
  "metric_description",
  "metric_type",
]

const RESULT_SKELETONS = Array.from({ length: 4 })

function splitTokens(value: string) {
  return value
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value]
}

type ChipButtonProps = {
  label: string
  selected: boolean
  onClick: () => void
}

function ChipButton({ label, selected, onClick }: ChipButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] transition",
        selected
          ? "border-primary/70 bg-primary/15 text-primary"
          : "border-border/70 bg-background/60 text-muted-foreground hover:border-primary/40",
      ].join(" ")}
    >
      {label}
    </button>
  )
}

export default function MetricsSearchPage() {
  const [baseUrl, setBaseUrl] = useState(() => normalizeBaseUrl(""))
  const [query, setQuery] = useState("")
  const [searchFields, setSearchFields] =
    useState<SearchField[]>(DEFAULT_FIELDS)
  const [activeOnly, setActiveOnly] = useState(true)
  const [useSimilarity, setUseSimilarity] = useState(true)
  const [similarity, setSimilarity] = useState(25)
  const [limit, setLimit] = useState(200)
  const [offset, setOffset] = useState(0)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedAggregations, setSelectedAggregations] = useState<string[]>([])
  const [selectedUnits, setSelectedUnits] = useState<string[]>([])
  const [selectedDirections, setSelectedDirections] = useState<string[]>([])
  const [metricKeys, setMetricKeys] = useState("")
  const [response, setResponse] = useState<MetricsSearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)

  const resolvedBaseUrl = useMemo(
    () => normalizeBaseUrl(baseUrl),
    [baseUrl]
  )

  const buildFilters = (): MetricSearchFilters => {
    const filters: MetricSearchFilters = {}
    if (activeOnly) {
      filters.is_active = [true]
    }
    if (selectedTypes.length) {
      filters.metric_type = selectedTypes
    }
    if (selectedAggregations.length) {
      filters.aggregation = selectedAggregations
    }
    if (selectedUnits.length) {
      filters.unit = selectedUnits
    }
    if (selectedDirections.length) {
      filters.directionality = selectedDirections
    }
    const keys = splitTokens(metricKeys)
    if (keys.length) {
      filters.metric_key = keys
    }
    return filters
  }

  const runSearch = async (nextOffset: number) => {
    setLoading(true)
    setError(null)
    setOffset(nextOffset)
    try {
      const fields =
        searchFields.length > 0 ? searchFields : DEFAULT_FIELDS
      const payload = {
        filters: buildFilters(),
        q: query.trim() || null,
        search_fields: fields,
        similarity: useSimilarity ? Number((similarity / 100).toFixed(2)) : null,
        limit,
        offset: nextOffset,
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }
      const response = await fetch(
        `${resolvedBaseUrl}/v1/metrics/search`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        }
      )
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || `Request failed with status ${response.status}`)
      }
      const data = (await response.json()) as MetricsSearchResponse
      setResponse(data)
      setLastRunAt(new Date().toLocaleTimeString())
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Search failed unexpectedly."
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => runSearch(0)
  const handleNext = () => runSearch(offset + limit)
  const handlePrev = () => runSearch(Math.max(0, offset - limit))

  const resultCount = response?.items.length ?? 0
  const resultRange =
    response && resultCount > 0
      ? `${offset + 1}-${offset + resultCount}`
      : "0"

  return (
    <div className="app-shell min-h-screen">
      <div className="canvas-grid min-h-screen">
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-16 pt-8">
          <section className="rounded-2xl border border-border/60 bg-background/70 px-5 py-4 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
                  <Sparkles className="size-5" />
                </span>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground">
                    Metrics Search
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-semibold">
                      Find the right metric fast
                    </span>
                    <Badge
                      variant="secondary"
                      className="rounded-full text-[10px] uppercase"
                    >
                      Search Console
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <Card className="bg-card/85">
            <CardHeader>
              <CardTitle className="text-lg">Search metrics</CardTitle>
              <CardDescription>
                Type a query, pick a few filters, and explore what is available.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form
                className="flex flex-col gap-3 md:flex-row md:items-center"
                onSubmit={(event) => {
                  event.preventDefault()
                  handleSearch()
                }}
              >
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search revenue, churn, ARPU, subscriber growth"
                    className="h-11 pl-9 text-sm"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 gap-2 px-5"
                >
                  {loading ? (
                    <LoadingOrbit size="sm" className="text-primary-foreground" />
                  ) : (
                    <Search className="size-4" />
                  )}
                  {loading ? "Searching..." : "Search"}
                </Button>
              </form>

              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Search in
                </Label>
                <div className="flex flex-wrap gap-2">
                  {SEARCH_FIELDS.map((field) => (
                    <ChipButton
                      key={field.id}
                      label={field.label}
                      selected={searchFields.includes(field.id)}
                      onClick={() =>
                        setSearchFields((current) =>
                          toggleValue(current, field.id)
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Switch
                  checked={activeOnly}
                  onCheckedChange={setActiveOnly}
                  size="sm"
                />
                Active metrics only
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Fuzzy match</span>
                <Switch
                  checked={useSimilarity}
                  onCheckedChange={setUseSimilarity}
                  size="sm"
                />
                <div className="w-32">
                  <Slider
                    value={[similarity]}
                    min={0}
                    max={100}
                    step={1}
                    disabled={!useSimilarity}
                    onValueChange={(value) => setSimilarity(value[0] ?? 0)}
                  />
                </div>
                <span>{(similarity / 100).toFixed(2)}</span>
              </div>
            </CardFooter>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <Card className="bg-card/85">
              <CardHeader>
                <CardTitle className="text-base">
                  <span className="flex items-center gap-2">
                    <Filter className="size-4 text-muted-foreground" />
                    Filters
                  </span>
                </CardTitle>
                <CardDescription>
                  Optional filters to narrow your results.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Metric type
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {METRIC_TYPES.map((item) => (
                      <ChipButton
                        key={item}
                        label={item}
                        selected={selectedTypes.includes(item)}
                        onClick={() =>
                          setSelectedTypes((current) =>
                            toggleValue(current, item)
                          )
                        }
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Aggregation
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {AGGREGATIONS.map((item) => (
                      <ChipButton
                        key={item}
                        label={item}
                        selected={selectedAggregations.includes(item)}
                        onClick={() =>
                          setSelectedAggregations((current) =>
                            toggleValue(current, item)
                          )
                        }
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Unit
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {UNITS.map((item) => (
                      <ChipButton
                        key={item}
                        label={item}
                        selected={selectedUnits.includes(item)}
                        onClick={() =>
                          setSelectedUnits((current) =>
                            toggleValue(current, item)
                          )
                        }
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Directionality
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {DIRECTIONALITY.map((item) => (
                      <ChipButton
                        key={item}
                        label={item}
                        selected={selectedDirections.includes(item)}
                        onClick={() =>
                          setSelectedDirections((current) =>
                            toggleValue(current, item)
                          )
                        }
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metric-keys">
                    Specific metric keys (optional)
                  </Label>
                  <Input
                    id="metric-keys"
                    value={metricKeys}
                    onChange={(event) => setMetricKeys(event.target.value)}
                    placeholder="revenue_mrr | churn_rate"
                  />
                  <p className="text-xs text-muted-foreground">
                    Separate keys with comma or |.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="base-url">API base URL</Label>
                  <Input
                    id="base-url"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder="http://localhost:8000"
                  />
                  <p className="text-xs text-muted-foreground">
                    Connected to {resolvedBaseUrl}
                  </p>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setQuery("")
                    setSearchFields(DEFAULT_FIELDS)
                    setActiveOnly(true)
                    setUseSimilarity(true)
                    setSimilarity(25)
                    setLimit(200)
                    setOffset(0)
                    setSelectedTypes([])
                    setSelectedAggregations([])
                    setSelectedUnits([])
                    setSelectedDirections([])
                    setMetricKeys("")
                    setResponse(null)
                    setError(null)
                  }}
                  disabled={loading}
                >
                  Clear all filters
                </Button>
              </CardFooter>
            </Card>

            <Card className="bg-card/85">
              <CardHeader>
                <CardTitle className="text-base">Results</CardTitle>
                <CardDescription>
                  {response
                    ? `Showing ${resultRange} of ${resultCount} matches`
                    : "Run a search to load metrics."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative space-y-4">
                  {loading && response ? (
                    <LoadingOverlay label="Refreshing results" />
                  ) : null}
                  {error ? (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                      {error}
                    </div>
                  ) : null}
                  {loading && !response ? (
                    <div className="grid gap-4">
                      {RESULT_SKELETONS.map((_, index) => (
                        <div
                          key={`result-skeleton-${index}`}
                          className="rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-40" />
                              <Skeleton className="h-3 w-24" />
                            </div>
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </div>
                          <div className="mt-3 space-y-2">
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-5/6" />
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Skeleton className="h-5 w-20 rounded-full" />
                            <Skeleton className="h-5 w-20 rounded-full" />
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : !response ? (
                    <div className="rounded-lg border border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
                      Use the search bar to explore metrics.
                    </div>
                  ) : response.items.length === 0 ? (
                    <div className="rounded-lg border border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
                      No matches. Try a broader query or remove filters.
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {response.items.map((item) => (
                        <div
                          key={item.metric_key}
                          className="rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-base font-semibold">
                                {item.metric_name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {item.metric_key}
                              </div>
                            </div>
                            <Badge
                              variant={item.is_active ? "secondary" : "outline"}
                              className="rounded-full text-[10px] uppercase"
                            >
                              {item.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <p className="mt-3 text-sm text-muted-foreground">
                            {item.metric_description || "No description yet."}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Badge variant="secondary" className="rounded-full">
                              {item.metric_type}
                            </Badge>
                            <Badge variant="secondary" className="rounded-full">
                              {item.aggregation}
                            </Badge>
                            {item.unit ? (
                              <Badge variant="outline" className="rounded-full">
                                {item.unit}
                              </Badge>
                            ) : null}
                            {item.directionality ? (
                              <Badge variant="outline" className="rounded-full">
                                {item.directionality}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Results per page</span>
                  <div className="w-28">
                    <Slider
                      value={[limit]}
                      min={50}
                      max={500}
                      step={50}
                      onValueChange={(value) => setLimit(value[0] ?? 200)}
                    />
                  </div>
                  <span>{limit}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrev}
                    disabled={loading || offset === 0}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNext}
                    disabled={loading || (response?.items.length ?? 0) < limit}
                  >
                    Next
                  </Button>
                </div>
                {lastRunAt ? (
                  <span className="text-xs text-muted-foreground">
                    Updated {lastRunAt}
                  </span>
                ) : null}
              </CardFooter>
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
}
