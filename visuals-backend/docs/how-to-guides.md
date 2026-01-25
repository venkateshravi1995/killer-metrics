# Visuals Backend How-to Guides

## List dashboards with pagination
1. `GET /v1/dashboards?limit=50`.
2. If `next_cursor` is returned, pass it as `cursor` to fetch the next page.

## Update a draft tile
1. `POST /v1/dashboards/{dashboard_id}/draft/tiles` to create a draft and add a tile.
2. `PUT /v1/dashboards/{dashboard_id}/draft/tiles/{tile_id}` to update the tile payload.
3. `POST /v1/dashboards/{dashboard_id}/draft/commit` to publish.

## Update draft layout in bulk
1. `PUT /v1/dashboards/{dashboard_id}/draft/layout` with a list of `{ id, layout }` patches.
2. Each layout patch updates the tile’s `layout` in the stored tile config.
