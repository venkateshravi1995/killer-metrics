from __future__ import annotations

import base64
import binascii
import json
import uuid
from copy import deepcopy
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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

router = APIRouter(prefix="/v1/dashboards", tags=["dashboards"])


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
    except (ValueError, binascii.Error, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="Invalid cursor.")
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Invalid cursor.")
    return parsed


def _extract_tiles(config: dict) -> list[dict]:
    tiles = config.get("tiles")
    if isinstance(tiles, list):
        return deepcopy(tiles)
    return []


def _build_config(tiles: list[dict]) -> dict:
    return {"tiles": tiles}


def _tiles_from_rows(rows: list[DashboardTile]) -> list[dict]:
    return [row.config for row in rows]


def _item_to_dashboard(
    item: Dashboard,
    *,
    tiles: list[dict],
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


def get_client_id(
    x_client_id: str | None = Header(default=None, alias=settings.client_id_header),
    x_user_id: str | None = Header(default=None, alias=settings.user_id_header),
) -> str:
    value = (x_client_id or x_user_id or "1").strip()
    return value or "1"


def get_user_id(
    x_user_id: str | None = Header(default=None, alias=settings.user_id_header),
    x_client_id: str | None = Header(default=None, alias=settings.client_id_header),
) -> str:
    value = (x_user_id or x_client_id or "1").strip()
    return value or "1"


async def _get_published_dashboard(
    session: AsyncSession,
    dashboard_id: str,
    client_id: str,
) -> Dashboard:
    result = await session.execute(
        select(Dashboard).where(
            Dashboard.id == dashboard_id,
            Dashboard.client_id == client_id,
            Dashboard.is_draft.is_(False),
            Dashboard.user_id == "",
        )
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
        )
    )
    return result.scalar_one_or_none()


async def _fetch_tiles(
    session: AsyncSession,
    filters,
) -> list[DashboardTile]:
    result = await session.execute(
        select(DashboardTile).where(*filters).order_by(DashboardTile.position)
    )
    return result.scalars().all()


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
    client_id: str = Depends(get_client_id),
    session: AsyncSession = Depends(get_session),
) -> DashboardOut:
    dashboard_id = uuid.uuid4().hex
    tiles = _extract_tiles(payload.config)
    async with session.begin():
        dashboard = Dashboard(
            id=dashboard_id,
            client_id=client_id,
            user_id="",
            is_draft=False,
            name=payload.name,
            description=payload.description,
        )
        session.add(dashboard)
        if tiles:
            tile_rows = [
                DashboardTile(
                    dashboard_id=dashboard_id,
                    user_id="",
                    is_draft=False,
                    tile_id=tile["id"],
                    position=index,
                    config=tile,
                )
                for index, tile in enumerate(tiles)
            ]
            session.add_all(tile_rows)
    await session.refresh(dashboard)
    return _item_to_dashboard(dashboard, tiles=tiles)


@router.get("", response_model=DashboardList)
async def list_dashboards(
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = Query(None),
    client_id: str = Depends(get_client_id),
    session: AsyncSession = Depends(get_session),
) -> DashboardList:
    cursor_value = _decode_cursor(cursor)
    stmt = (
        select(Dashboard)
        .where(
            Dashboard.client_id == client_id,
            Dashboard.is_draft.is_(False),
            Dashboard.user_id == "",
        )
        .order_by(Dashboard.updated_at.desc(), Dashboard.id.desc())
        .limit(limit + 1)
    )
    if cursor_value:
        try:
            raw_updated = str(cursor_value["updated_at"])
            cursor_updated = datetime.fromisoformat(raw_updated.replace("Z", "+00:00"))
            cursor_id = str(cursor_value["id"])
        except (KeyError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid cursor.")
        stmt = stmt.where(
            or_(
                Dashboard.updated_at < cursor_updated,
                and_(
                    Dashboard.updated_at == cursor_updated,
                    Dashboard.id < cursor_id,
                ),
            )
        )
    result = await session.execute(stmt)
    items = result.scalars().all()
    next_cursor = None
    if len(items) > limit:
        last = items.pop()
        next_cursor = _encode_cursor(
            {
                "updated_at": last.updated_at.isoformat(),
                "id": last.id,
            }
        )
    return DashboardList(
        items=[_item_to_summary(item) for item in items],
        limit=limit,
        next_cursor=next_cursor,
    )


@router.get("/{dashboard_id}", response_model=DashboardOut)
async def get_dashboard(
    dashboard_id: str,
    client_id: str = Depends(get_client_id),
    user_id: str = Depends(get_user_id),
    session: AsyncSession = Depends(get_session),
) -> DashboardOut:
    published = await _get_published_dashboard(session, dashboard_id, client_id)
    draft = await _get_draft_dashboard(session, dashboard_id, user_id, client_id)
    if draft:
        draft_tiles = await _fetch_tiles(
            session,
            [
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == user_id,
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
        session,
        [
            DashboardTile.dashboard_id == dashboard_id,
            DashboardTile.user_id == "",
            DashboardTile.is_draft.is_(False),
        ],
    )
    return _item_to_dashboard(published, tiles=_tiles_from_rows(published_tiles))


@router.put("/{dashboard_id}", response_model=DashboardOut)
async def update_dashboard(
    dashboard_id: str,
    payload: DashboardUpdate,
    client_id: str = Depends(get_client_id),
    session: AsyncSession = Depends(get_session),
) -> DashboardOut:
    tiles = _extract_tiles(payload.config)
    async with session.begin():
        published = await _get_published_dashboard(session, dashboard_id, client_id)
        published.name = payload.name
        published.description = payload.description
        published.updated_at = func.now()
        published.tiles = []
        if tiles:
            published.tiles = [
                DashboardTile(
                    dashboard_id=dashboard_id,
                    user_id="",
                    is_draft=False,
                    tile_id=tile["id"],
                    position=index,
                    config=tile,
                )
                for index, tile in enumerate(tiles)
            ]
    await session.refresh(published)
    return _item_to_dashboard(published, tiles=tiles)


@router.post("/{dashboard_id}/draft/tiles", status_code=status.HTTP_204_NO_CONTENT)
async def add_tile_to_draft(
    dashboard_id: str,
    payload: TilePayload,
    client_id: str = Depends(get_client_id),
    user_id: str = Depends(get_user_id),
    session: AsyncSession = Depends(get_session),
) -> Response:
    async with session.begin():
        published = await _get_published_dashboard(session, dashboard_id, client_id)
        draft = await _get_draft_dashboard(session, dashboard_id, user_id, client_id)
        if not draft:
            published_tiles = await _fetch_tiles(
                session,
                [
                    DashboardTile.dashboard_id == dashboard_id,
                    DashboardTile.user_id == "",
                    DashboardTile.is_draft.is_(False),
                ],
            )
            draft = await _seed_draft(session, published, published_tiles, user_id, client_id)
        exists = await session.execute(
            select(DashboardTile.tile_id).where(
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == user_id,
                DashboardTile.is_draft.is_(True),
                DashboardTile.tile_id == payload.id,
            )
        )
        if exists.first():
            raise HTTPException(status_code=409, detail="Tile already exists.")
        max_position = await session.execute(
            select(func.coalesce(func.max(DashboardTile.position), -1)).where(
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == user_id,
                DashboardTile.is_draft.is_(True),
            )
        )
        position = max_position.scalar_one() + 1
        session.add(
            DashboardTile(
                dashboard_id=dashboard_id,
                user_id=user_id,
                is_draft=True,
                tile_id=payload.id,
                position=position,
                config=payload.model_dump(),
            )
        )
        draft.updated_at = func.now()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/{dashboard_id}/draft/tiles/{tile_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def update_tile_in_draft(
    dashboard_id: str,
    tile_id: str,
    payload: TilePayload,
    client_id: str = Depends(get_client_id),
    user_id: str = Depends(get_user_id),
    session: AsyncSession = Depends(get_session),
) -> Response:
    if payload.id != tile_id:
        raise HTTPException(status_code=400, detail="Tile id mismatch.")
    async with session.begin():
        published = await _get_published_dashboard(session, dashboard_id, client_id)
        draft = await _get_draft_dashboard(session, dashboard_id, user_id, client_id)
        if not draft:
            published_tiles = await _fetch_tiles(
                session,
                [
                    DashboardTile.dashboard_id == dashboard_id,
                    DashboardTile.user_id == "",
                    DashboardTile.is_draft.is_(False),
                ],
            )
            draft = await _seed_draft(session, published, published_tiles, user_id, client_id)
        result = await session.execute(
            select(DashboardTile).where(
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == user_id,
                DashboardTile.is_draft.is_(True),
                DashboardTile.tile_id == tile_id,
            )
        )
        tile = result.scalar_one_or_none()
        if tile is None:
            raise HTTPException(status_code=404, detail="Tile not found.")
        now_expr = func.now()
        tile.config = payload.model_dump()
        tile.updated_at = now_expr
        draft.updated_at = now_expr
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/{dashboard_id}/draft/tiles/{tile_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_tile_from_draft(
    dashboard_id: str,
    tile_id: str,
    client_id: str = Depends(get_client_id),
    user_id: str = Depends(get_user_id),
    session: AsyncSession = Depends(get_session),
) -> Response:
    async with session.begin():
        published = await _get_published_dashboard(session, dashboard_id, client_id)
        draft = await _get_draft_dashboard(session, dashboard_id, user_id, client_id)
        if not draft:
            published_tiles = await _fetch_tiles(
                session,
                [
                    DashboardTile.dashboard_id == dashboard_id,
                    DashboardTile.user_id == "",
                    DashboardTile.is_draft.is_(False),
                ],
            )
            if not any(tile.tile_id == tile_id for tile in published_tiles):
                raise HTTPException(status_code=404, detail="Tile not found.")
            draft = await _seed_draft(session, published, published_tiles, user_id, client_id)
        result = await session.execute(
            select(DashboardTile).where(
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == user_id,
                DashboardTile.is_draft.is_(True),
                DashboardTile.tile_id == tile_id,
            )
        )
        tile = result.scalar_one_or_none()
        if tile is None:
            raise HTTPException(status_code=404, detail="Tile not found.")
        await session.delete(tile)
        draft.updated_at = func.now()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{dashboard_id}/draft/layout", status_code=status.HTTP_204_NO_CONTENT)
async def update_draft_layout(
    dashboard_id: str,
    payload: TileLayoutUpdate,
    client_id: str = Depends(get_client_id),
    user_id: str = Depends(get_user_id),
    session: AsyncSession = Depends(get_session),
) -> Response:
    async with session.begin():
        published = await _get_published_dashboard(session, dashboard_id, client_id)
        draft = await _get_draft_dashboard(session, dashboard_id, user_id, client_id)
        if not draft:
            published_tiles = await _fetch_tiles(
                session,
                [
                    DashboardTile.dashboard_id == dashboard_id,
                    DashboardTile.user_id == "",
                    DashboardTile.is_draft.is_(False),
                ],
            )
            draft = await _seed_draft(session, published, published_tiles, user_id, client_id)
        tile_ids = [item.id for item in payload.items]
        if not tile_ids:
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        result = await session.execute(
            select(DashboardTile).where(
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == user_id,
                DashboardTile.is_draft.is_(True),
                DashboardTile.tile_id.in_(tile_ids),
            )
        )
        rows = {row.tile_id: row for row in result.scalars().all()}
        missing = [tile_id for tile_id in tile_ids if tile_id not in rows]
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"Tiles not found: {', '.join(missing)}",
            )
        now_expr = func.now()
        for item in payload.items:
            tile = rows[item.id]
            config = dict(tile.config)
            config["layout"] = item.layout
            tile.config = config
            tile.updated_at = now_expr
        draft.updated_at = now_expr
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{dashboard_id}/draft/metadata", status_code=status.HTTP_204_NO_CONTENT)
async def update_draft_metadata(
    dashboard_id: str,
    payload: DashboardMetadataUpdate,
    client_id: str = Depends(get_client_id),
    user_id: str = Depends(get_user_id),
    session: AsyncSession = Depends(get_session),
) -> Response:
    fields_set = payload.model_fields_set
    if not fields_set:
        raise HTTPException(status_code=400, detail="No metadata updates provided.")
    async with session.begin():
        published = await _get_published_dashboard(session, dashboard_id, client_id)
        draft = await _get_draft_dashboard(session, dashboard_id, user_id, client_id)
        if not draft:
            published_tiles = await _fetch_tiles(
                session,
                [
                    DashboardTile.dashboard_id == dashboard_id,
                    DashboardTile.user_id == "",
                    DashboardTile.is_draft.is_(False),
                ],
            )
            draft = await _seed_draft(session, published, published_tiles, user_id, client_id)
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
        draft.updated_at = func.now()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{dashboard_id}/draft/commit", response_model=DashboardOut)
async def commit_draft(
    dashboard_id: str,
    client_id: str = Depends(get_client_id),
    user_id: str = Depends(get_user_id),
    session: AsyncSession = Depends(get_session),
) -> DashboardOut:
    async with session.begin():
        published = await _get_published_dashboard(session, dashboard_id, client_id)
        draft = await _get_draft_dashboard(session, dashboard_id, user_id, client_id)
        if not draft:
            raise HTTPException(status_code=404, detail="Draft not found.")
        draft_tiles = await _fetch_tiles(
            session,
            [
                DashboardTile.dashboard_id == dashboard_id,
                DashboardTile.user_id == user_id,
                DashboardTile.is_draft.is_(True),
            ],
        )
        published.name = draft.name
        published.description = draft.description
        published.updated_at = func.now()
        published.tiles = [
            DashboardTile(
                dashboard_id=dashboard_id,
                user_id="",
                is_draft=False,
                tile_id=tile.tile_id,
                position=tile.position,
                config=tile.config,
                created_at=tile.created_at,
            )
            for tile in draft_tiles
        ]
        await session.delete(draft)
    await session.refresh(published)
    return _item_to_dashboard(
        published,
        tiles=_tiles_from_rows(draft_tiles),
    )


@router.delete("/{dashboard_id}/draft", status_code=status.HTTP_204_NO_CONTENT)
async def delete_draft(
    dashboard_id: str,
    client_id: str = Depends(get_client_id),
    user_id: str = Depends(get_user_id),
    session: AsyncSession = Depends(get_session),
) -> Response:
    async with session.begin():
        result = await session.execute(
            select(Dashboard).where(
                Dashboard.id == dashboard_id,
                Dashboard.user_id == user_id,
                Dashboard.client_id == client_id,
                Dashboard.is_draft.is_(True),
            )
        )
        draft = result.scalar_one_or_none()
        if draft:
            await session.delete(draft)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dashboard(
    dashboard_id: str,
    client_id: str = Depends(get_client_id),
    session: AsyncSession = Depends(get_session),
) -> Response:
    async with session.begin():
        result = await session.execute(
            select(Dashboard).where(
                Dashboard.id == dashboard_id,
                Dashboard.client_id == client_id,
            )
        )
        dashboards_to_delete = result.scalars().all()
        if not dashboards_to_delete:
            raise HTTPException(status_code=404, detail="Dashboard not found.")
        for dashboard in dashboards_to_delete:
            await session.delete(dashboard)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
