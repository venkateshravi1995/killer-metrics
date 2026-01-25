# Metrics Backend Explanation

## Query model
The API is built around a catalog of metrics and dimensions, plus a fact table of metric observations. Catalog endpoints expose what’s available, while query endpoints aggregate observations across time ranges and dimensions. The frontend uses these APIs to drive tile data and configuration.
