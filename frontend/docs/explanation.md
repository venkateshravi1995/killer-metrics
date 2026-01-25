# Frontend Explanation

## How tile data flows
Tiles are defined by `TileConfig` and rendered by a tile definition. Each tile definition declares:
- The data source and range requirements.
- The backend API endpoint and method to fetch data.
- Which visual options are available for customization.

The builder UI uses these definitions to ensure tiles only expose relevant controls and to shape the requests it sends to the metrics backend.
