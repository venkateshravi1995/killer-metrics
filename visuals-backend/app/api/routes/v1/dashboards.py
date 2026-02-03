"""Dashboard CRUD endpoints."""

from __future__ import annotations

import base64
import binascii
import json
import uuid
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Annotated, Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, delete, func, or_, select

from app.api.cache import (
    DASHBOARD_TTL_SECONDS,
    build_cache_key,
    bump_dashboard_cache_version,
    cached_json,
    get_dashboard_cache_version,
)
from app.core.auth import AuthContext, require_local_auth
from app.db.schema import Dashboard, DashboardTile
from app.db.session import get_session
from app.schemas.dashboards import (
    DashboardCreate,
    DashboardList,
    DashboardMetadataUpdate,
    DashboardOut,
    DashboardSummary,
    DashboardUpdate,
    TileLayoutUpdate,
    TilePayload,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.sql.elements import ColumnElement
else:
    AsyncSession = Any

router = APIRouter(prefix="/v1/dashboards", tags=["dashboards"])

LOCAL_AUTH_DEP = Depends(require_local_auth)
SESSION_DEPENDENCY = Depends(get_session)
SessionDep = Annotated[AsyncSession, SESSION_DEPENDENCY]


def _encode_cursor(value: dict | None) -> str | None:
    if not value:
        return None
    raw = json.dumps(value).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8")


def _decode_cursor(value: str | None) -> dict | None:
    if not value:
        return None
    try:
        raw = base64.urlsafe_b64decode(value.encode("utf-8"))
        parsed = json.loads(raw.decode("utf-8"))
    except (ValueError, binascii.Error, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid cursor.") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Invalid cursor.")
    return parsed


def _db_now() -> datetime:
    return cast("datetime", func.now())


def _extract_tiles(config: dict[str, Any]) -> list[dict[str, Any]]:
    tiles = config.get("tiles")
    if isinstance(tiles, list):
        return deepcopy(tiles)
    return []


def _build_config(tiles: list[dict[str, Any]]) -> dict[str, Any]:
    return {"tiles": tiles}


def _tiles_from_rows(rows: list[DashboardTile]) -> list[dict[str, Any]]:
    return [row.config for row in rows]


def _apply_layout_update(
    config: dict[str, Any],
    layout: dict[str, int],
    layout_breakpoint: str | None,
) -> dict[str, Any]:
    updated = dict(config)
    if layout_breakpoint:
        layouts = updated.get("layouts")
        if not isinstance(layouts, dict):
            layouts = {}
        layouts[layout_breakpoint] = layout
        updated["layouts"] = layouts
        if layout_breakpoint == "lg":
            updated["layout"] = layout
        return updated
    updated["layout"] = layout
    layouts = updated.get("layouts")
    if isinstance(layouts, dict):
        layouts.setdefault("lg", layout)
        updated["layouts"] = layouts
        return updated
    updated["layouts"] = {"lg": layout}
    return updated


def _item_to_dashboard(
    item: Dashboard,
    *,
    tiles: list[dict[str, Any]],
    created_at_override: datetime | None = None,
    is_draft: bool = False,
) -> DashboardOut:
    created_at = created_at_override or item.created_at
    return DashboardOut(
        id=item.id,
        client_id=item.client_id,
        name=item.name,
        description=item.description,
        config=_build_config(tiles),
        created_at=created_at,
        updated_at=item.updated_at,
        is_draft=is_draft,
    )


def _item_to_summary(item: Dashboard) -> DashboardSummary:
    return DashboardSummary(
        id=item.id,
        name=item.name,
        description=item.description,
        updated_at=item.updated_at,
    )


def get_client_id(auth: Annotated[AuthContext, LOCAL_AUTH_DEP]) -> str:
    """Resolve the client identifier from local auth."""
    return auth.client_id


def get_user_id(auth: Annotated[AuthContext, LOCAL_AUTH_DEP]) -> str:
    """Resolve the user identifier from local auth."""
    return auth.user_id


@dataclass(frozen=True)
class RequestContext:
    """Shared request dependencies for dashboard routes."""

    client_id: str
    user_id: str
    session: AsyncSession


def get_request_context(
    client_id: Annotated[str, Depends(get_client_id)],
    user_id: Annotated[str, Depends(get_user_id)],
    session: SessionDep,
) -> RequestContext:
    """Build a request context from headers and session dependency."""
    return RequestContext(client_id=client_id, user_id=user_id, session=session)


async def _get_published_dashboard(
    session: AsyncSession,
    dashboard_id: str,
    user_id: str,
    client_id: str,
) -> Dashboard:
    result = await session.execute(
        select(Dashboard).where(
            Dashboard.id == dashboard_id,
            Dashboard.user_id == user_id,
            Dashboard.client_id == client_id,
            Dashboard.is_draft.is_(False),
        ),
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Dashboard not found.")
    return item


async def _get_draft_dashboard(
    session: AsyncSession,
    dashboard_id: str,
    user_id: str,
    client_id: str,
) -> Dashboard | None:
    result = await session.execute(
        select(Dashboard).where(
            Dashboard.id == dashboard_id,
            Dashboard.user_id == user_id,
            Dashboard.client_id == client_id,
            Dashboard.is_draft.is_(True),
        ),
    )
    return result.scalar_one_or_none()


async def _fetch_tiles(
    session: AsyncSession,
    filters: Sequence[ColumnElement[bool]],
) -> list[DashboardTile]:
    result = await session.execute(
        select(DashboardTile).where(*filters).order_by(DashboardTile.position),
    )
    return list(result.scalars().all())


async def _seed_draft(
    session: AsyncSession,
    published: Dashboard,
    published_tiles: list[DashboardTile],
    user_id: str,
    client_id: str,
) -> Dashboard:
    draft = Dashboard(
        client_id=client_id,
        id=published.id,
        user_id=user_id,
        is_draft=True,
        name=published.name,
        description=published.description,
    )
    session.add(draft)
    if published_tiles:
        draft_tiles = [
            DashboardTile(
                dashboard_id=published.id,
                user_id=user_id,
                is_draft=True,
                tile_id=tile.tile_id,
                position=tile.position,
                config=tile.config,
                created_at=tile.created_at,
            )
            for tile in published_tiles
        ]
        session.add_all(draft_tiles)
    return draft


@router.post("", response_model=DashboardOut, status_code=status.HTTP_201_CREATED)
async def create_dashboard(
    payload: DashboardCreate,
    context: Annotated[RequestContext, Depends(get_request_context)],
) -> DashboardOut:
    """Create a new published dashboard."""
    dashboard_id = uuid.uuid4().hex
    tiles = _extract_tiles(payload.config)
    async with context.session.begin():
        dashboard = Dashboard(
            id=dashboard_id,
            client_id=context.client_id,
            user_id=context.user_id,
            is_draft=False,
            name=payload.name,
            description=payload.description,
        )
        context.session.add(dashboard)
        if tiles:
            tile_rows = [
                DashboardTile(
                    dashboard_id=dashboard_id,
                    user_id=context.user_id,
                    is_draft=False,
                    tile_id=tile["id"],
                    position=index,
                    config=tile,
                )
                for index, tile in enumerate(tiles)
            ]
            context.session.add_all(tile_rows)
    await context.session.refresh(dashboard)
    await bump_dashboard_cache_version(context.client_id, context.user_id)
    return _item_to_dashboard(dashboard, tiles=tiles)


@router.get("", response_model=DashboardList)
async def list_dashboards(
    context: Annotated[RequestContext, Depends(get_request_context)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    cursor: Annotated[str | None, Query()] = None,
) -> DashboardList:
    """List published dashboards with cursor pagination."""
    cache_version = await get_dashboard_cache_version(context.client_id, context.user_id)
    cache_key = build_cache_key(
        "dashboards:list",
        {
            "version": cache_version,
            "client_id": context.client_id,
            "user_id": context.user_id,
            "limit": limit,
            "cursor": cursor,
        },
    )

    async def _compute() -> DashboardList:
        cursor_value = _decode_cursor(cursor)
        stmt = (
            select(Dashboard)
            .where(
                Dashboard.client_id == context.client_id,
                Dashboard.is_draft.is_(False),
                Dashboard.user_id == context.user_id,
            )
            .order_by(Dashboard.updated_at.desc(), Dashboard.id.desc())
            .limit(limit + 1)
        )
        if cursor_value:
            try:
                raw_updated = str(cursor_value["updated_at"])
                if raw_updated.endswith("Z"):
                    raw_updated = raw_updated.removesuffix("Z") + "+00:00"
                cursor_updated = datetime.fromisoformat(raw_updated)
                cursor_id = str(cursor_value["id"])
            except (KeyError, ValueError) as exc:
                raise HTTPException(status_code=400, detail="Invalid cursor.") from exc
            stmt = stmt.where(
                or_(
                    Dashboard.updated_at < cursor_updated,
                    and_(
                        Dashboard.updated_at == cursor_updated,
                        Dashboard.id < cursor_id,
                    ),
                ),
            )
        result = await context.session.execute(stmt)
        items = list(result.scalars().all())
        next_cursor = None
        if len(items) > limit:
            items.pop()
            last = items[-1]
            next_cursor = _encode_cursor(
                {
                    "updated_at": last.updated_at.isoformat(),
                    "id": last.id,
                },
            )
        return DashboardList(
            items=[_item_to_summary(item) for item in items],
            limit=limit,
            next_cursor=next_cursor,
        )

    return await cached_json(cache_key, DASHBOARD_TTL_SECONDS, _compute)


@router.get("/{dashboard_id}", response_model=DashboardOut)
async def get_dashboard(
    dashboard_id: str,
    context: Annotated[RequestContext, Depends(get_request_context)],
) -> DashboardOut:
    """Fetch a published dashboard or user draft."""
    cache_version = await get_dashboard_cache_version(context.client_id, context.user_id)
    cache_key = build_cache_key(
        "dashboards:get",
        {
            "version": cache_version,
            "client_id": context.client_id,
            "user_id": context.user_id,
            "dashboard_id": dashboard_id,
        },
    )

    async def _compute() -> DashboardOut:
        published = await _get_published_dashboard(
            context.session,
            dashboard_id,
            context.user_id,
            context.client_id,
        )
        draft = await _get_draft_dashboard(
            context.session,
            dashboard_id,
            context.user_id,
            context.client_id,
        )
        if draft:
            draft_tiles = await _fetch_tiles(
                context.session,
                [
                    DashboardTile.dashboard_id == dashboard_id,
                    DashboardTile.user_id == context.user_id,
                    DashboardTile.is_draft.is_(True),
                ],
            )
            return _item_to_dashboard(
                draft,
                tiles=_tiles_from_rows(draft_tiles),
                created_at_override=published.created_at,
                is_draft=True,
            )
        published_tiles = await _fetch_tiles(
            context.session,
            [
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == context.user_id,
                DashboardTile.is_draft.is_(False),
            ],
        )
        return _item_to_dashboard(published, tiles=_tiles_from_rows(published_tiles))

    return await cached_json(cache_key, DASHBOARD_TTL_SECONDS, _compute)


@router.put("/{dashboard_id}", response_model=DashboardOut)
async def update_dashboard(
    dashboard_id: str,
    payload: DashboardUpdate,
    context: Annotated[RequestContext, Depends(get_request_context)],
) -> DashboardOut:
    """Update a published dashboard and its tiles."""
    tiles = _extract_tiles(payload.config)
    async with context.session.begin():
        published = await _get_published_dashboard(
            context.session,
            dashboard_id,
            context.user_id,
            context.client_id,
        )
        published.name = payload.name
        published.description = payload.description
        published.updated_at = _db_now()
        await context.session.execute(
            delete(DashboardTile).where(
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == context.user_id,
                DashboardTile.is_draft.is_(False),
            ),
        )
        if tiles:
            context.session.add_all(
                [
                    DashboardTile(
                        dashboard_id=dashboard_id,
                        user_id=context.user_id,
                        is_draft=False,
                        tile_id=tile["id"],
                        position=index,
                        config=tile,
                    )
                    for index, tile in enumerate(tiles)
                ],
            )
    await context.session.refresh(published)
    await bump_dashboard_cache_version(context.client_id, context.user_id)
    return _item_to_dashboard(published, tiles=tiles)


@router.post("/{dashboard_id}/draft/tiles", status_code=status.HTTP_204_NO_CONTENT)
async def add_tile_to_draft(
    dashboard_id: str,
    payload: TilePayload,
    context: Annotated[RequestContext, Depends(get_request_context)],
) -> Response:
    """Add a tile to the user's draft dashboard."""
    async with context.session.begin():
        published = await _get_published_dashboard(
            context.session,
            dashboard_id,
            context.user_id,
            context.client_id,
        )
        draft = await _get_draft_dashboard(
            context.session,
            dashboard_id,
            context.user_id,
            context.client_id,
        )
        if not draft:
            published_tiles = await _fetch_tiles(
                context.session,
                [
                    DashboardTile.dashboard_id == dashboard_id,
                    DashboardTile.user_id == context.user_id,
                    DashboardTile.is_draft.is_(False),
                ],
            )
            draft = await _seed_draft(
                context.session,
                published,
                published_tiles,
                context.user_id,
                context.client_id,
            )
        exists = await context.session.execute(
            select(DashboardTile.tile_id).where(
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == context.user_id,
                DashboardTile.is_draft.is_(True),
                DashboardTile.tile_id == payload.id,
            ),
        )
        if exists.first():
            raise HTTPException(status_code=409, detail="Tile already exists.")
        max_position = await context.session.execute(
            select(func.coalesce(func.max(DashboardTile.position), -1)).where(
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == context.user_id,
                DashboardTile.is_draft.is_(True),
            ),
        )
        position = max_position.scalar_one() + 1
        context.session.add(
            DashboardTile(
                dashboard_id=dashboard_id,
                user_id=context.user_id,
                is_draft=True,
                tile_id=payload.id,
                position=position,
                config=payload.model_dump(),
            ),
        )
        draft.updated_at = _db_now()
    await bump_dashboard_cache_version(context.client_id, context.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/{dashboard_id}/draft/tiles/{tile_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def update_tile_in_draft(
    dashboard_id: str,
    tile_id: str,
    payload: TilePayload,
    context: Annotated[RequestContext, Depends(get_request_context)],
) -> Response:
    """Update a tile configuration in the user's draft."""
    if payload.id != tile_id:
        raise HTTPException(status_code=400, detail="Tile id mismatch.")
    async with context.session.begin():
        published = await _get_published_dashboard(
            context.session,
            dashboard_id,
            context.user_id,
            context.client_id,
        )
        draft = await _get_draft_dashboard(
            context.session,
            dashboard_id,
            context.user_id,
            context.client_id,
        )
        if not draft:
            published_tiles = await _fetch_tiles(
                context.session,
                [
                    DashboardTile.dashboard_id == dashboard_id,
                    DashboardTile.user_id == context.user_id,
                    DashboardTile.is_draft.is_(False),
                ],
            )
            draft = await _seed_draft(
                context.session,
                published,
                published_tiles,
                context.user_id,
                context.client_id,
            )
        result = await context.session.execute(
            select(DashboardTile).where(
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == context.user_id,
                DashboardTile.is_draft.is_(True),
                DashboardTile.tile_id == tile_id,
            ),
        )
        tile = result.scalar_one_or_none()
        if tile is None:
            raise HTTPException(status_code=404, detail="Tile not found.")
        now_expr = _db_now()
        tile.config = payload.model_dump()
        tile.updated_at = now_expr
        draft.updated_at = now_expr
    await bump_dashboard_cache_version(context.client_id, context.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/{dashboard_id}/draft/tiles/{tile_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_tile_from_draft(
    dashboard_id: str,
    tile_id: str,
    context: Annotated[RequestContext, Depends(get_request_context)],
) -> Response:
    """Delete a tile from the user's draft dashboard."""
    async with context.session.begin():
        published = await _get_published_dashboard(
            context.session,
            dashboard_id,
            context.user_id,
            context.client_id,
        )
        draft = await _get_draft_dashboard(
            context.session,
            dashboard_id,
            context.user_id,
            context.client_id,
        )
        if not draft:
            published_tiles = await _fetch_tiles(
                context.session,
                [
                    DashboardTile.dashboard_id == dashboard_id,
                    DashboardTile.user_id == context.user_id,
                    DashboardTile.is_draft.is_(False),
                ],
            )
            if not any(tile.tile_id == tile_id for tile in published_tiles):
                raise HTTPException(status_code=404, detail="Tile not found.")
            draft = await _seed_draft(
                context.session,
                published,
                published_tiles,
                context.user_id,
                context.client_id,
            )
        result = await context.session.execute(
            select(DashboardTile).where(
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == context.user_id,
                DashboardTile.is_draft.is_(True),
                DashboardTile.tile_id == tile_id,
            ),
        )
        tile = result.scalar_one_or_none()
        if tile is None:
            raise HTTPException(status_code=404, detail="Tile not found.")
        await context.session.delete(tile)
        draft.updated_at = _db_now()
    await bump_dashboard_cache_version(context.client_id, context.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{dashboard_id}/draft/layout", status_code=status.HTTP_204_NO_CONTENT)
async def update_draft_layout(
    dashboard_id: str,
    payload: TileLayoutUpdate,
    context: Annotated[RequestContext, Depends(get_request_context)],
    *,
    allow_missing: bool = False,
) -> Response:
    """Update tile layouts within a draft dashboard."""
    async with context.session.begin():
        published = await _get_published_dashboard(
            context.session,
            dashboard_id,
            context.user_id,
            context.client_id,
        )
        draft = await _get_draft_dashboard(
            context.session,
            dashboard_id,
            context.user_id,
            context.client_id,
        )
        if not draft:
            published_tiles = await _fetch_tiles(
                context.session,
                [
                    DashboardTile.dashboard_id == dashboard_id,
                    DashboardTile.user_id == context.user_id,
                    DashboardTile.is_draft.is_(False),
                ],
            )
            draft = await _seed_draft(
                context.session,
                published,
                published_tiles,
                context.user_id,
                context.client_id,
            )
        tile_ids = [item.id for item in payload.items]
        if not tile_ids:
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        result = await context.session.execute(
            select(DashboardTile).where(
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == context.user_id,
                DashboardTile.is_draft.is_(True),
                DashboardTile.tile_id.in_(tile_ids),
            ),
        )
        rows = {row.tile_id: row for row in result.scalars().all()}
        missing = [tile_id for tile_id in tile_ids if tile_id not in rows]
        if missing and not allow_missing:
            raise HTTPException(
                status_code=404,
                detail=f"Tiles not found: {', '.join(missing)}",
            )
        now_expr = _db_now()
        updated = False
        for item in payload.items:
            tile = rows.get(item.id)
            if tile is None:
                continue
            layout_breakpoint = (item.breakpoint or "").strip() or None
            tile.config = _apply_layout_update(
                dict(tile.config),
                item.layout,
                layout_breakpoint,
            )
            tile.updated_at = now_expr
            updated = True
        if updated:
            draft.updated_at = now_expr
    await bump_dashboard_cache_version(context.client_id, context.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{dashboard_id}/draft/metadata", status_code=status.HTTP_204_NO_CONTENT)
async def update_draft_metadata(
    dashboard_id: str,
    payload: DashboardMetadataUpdate,
    context: Annotated[RequestContext, Depends(get_request_context)],
) -> Response:
    """Update draft dashboard metadata."""
    fields_set = payload.model_fields_set
    if not fields_set:
        raise HTTPException(status_code=400, detail="No metadata updates provided.")
    async with context.session.begin():
        published = await _get_published_dashboard(
            context.session,
            dashboard_id,
            context.user_id,
            context.client_id,
        )
        draft = await _get_draft_dashboard(
            context.session,
            dashboard_id,
            context.user_id,
            context.client_id,
        )
        if not draft:
            published_tiles = await _fetch_tiles(
                context.session,
                [
                    DashboardTile.dashboard_id == dashboard_id,
                    DashboardTile.user_id == context.user_id,
                    DashboardTile.is_draft.is_(False),
                ],
            )
            draft = await _seed_draft(
                context.session,
                published,
                published_tiles,
                context.user_id,
                context.client_id,
            )
        name = draft.name
        description = draft.description
        if "name" in fields_set:
            name = payload.name or ""
        if "description" in fields_set:
            description = payload.description
        if not name:
            raise HTTPException(status_code=400, detail="Dashboard name is required.")
        draft.name = name
        draft.description = description
        draft.updated_at = _db_now()
    await bump_dashboard_cache_version(context.client_id, context.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{dashboard_id}/draft/commit", response_model=DashboardOut)
async def commit_draft(
    dashboard_id: str,
    context: Annotated[RequestContext, Depends(get_request_context)],
) -> DashboardOut:
    """Publish the user's draft dashboard."""
    async with context.session.begin():
        published = await _get_published_dashboard(
            context.session,
            dashboard_id,
            context.user_id,
            context.client_id,
        )
        draft = await _get_draft_dashboard(
            context.session,
            dashboard_id,
            context.user_id,
            context.client_id,
        )
        if not draft:
            raise HTTPException(status_code=404, detail="Draft not found.")
        draft_tiles = await _fetch_tiles(
            context.session,
            [
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == context.user_id,
                DashboardTile.is_draft.is_(True),
            ],
        )
        published.name = draft.name
        published.description = draft.description
        published.updated_at = _db_now()
        await context.session.execute(
            delete(DashboardTile).where(
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == context.user_id,
                DashboardTile.is_draft.is_(False),
            ),
        )
        if draft_tiles:
            context.session.add_all(
                [
                    DashboardTile(
                        dashboard_id=dashboard_id,
                        user_id=context.user_id,
                        is_draft=False,
                        tile_id=tile.tile_id,
                        position=tile.position,
                        config=tile.config,
                        created_at=tile.created_at,
                    )
                    for tile in draft_tiles
                ],
            )
        await context.session.delete(draft)
    await context.session.refresh(published)
    await bump_dashboard_cache_version(context.client_id, context.user_id)
    return _item_to_dashboard(
        published,
        tiles=_tiles_from_rows(draft_tiles),
    )


@router.delete("/{dashboard_id}/draft", status_code=status.HTTP_204_NO_CONTENT)
async def delete_draft(
    dashboard_id: str,
    context: Annotated[RequestContext, Depends(get_request_context)],
) -> Response:
    """Delete the user's draft dashboard."""
    async with context.session.begin():
        result = await context.session.execute(
            select(Dashboard).where(
                Dashboard.id == dashboard_id,
                Dashboard.user_id == context.user_id,
                Dashboard.client_id == context.client_id,
                Dashboard.is_draft.is_(True),
            ),
        )
        draft = result.scalar_one_or_none()
        if draft:
            await context.session.delete(draft)
    await bump_dashboard_cache_version(context.client_id, context.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dashboard(
    dashboard_id: str,
    context: Annotated[RequestContext, Depends(get_request_context)],
) -> Response:
    """Delete a published dashboard and related tiles."""
    async with context.session.begin():
        result = await context.session.execute(
            select(Dashboard).where(
                Dashboard.id == dashboard_id,
                Dashboard.user_id == context.user_id,
                Dashboard.client_id == context.client_id,
                Dashboard.is_draft.is_(False),
            ),
        )
        dashboards_to_delete = result.scalars().all()
        if not dashboards_to_delete:
            raise HTTPException(status_code=404, detail="Dashboard not found.")
        for dashboard in dashboards_to_delete:
            await context.session.delete(dashboard)
    await bump_dashboard_cache_version(context.client_id, context.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
