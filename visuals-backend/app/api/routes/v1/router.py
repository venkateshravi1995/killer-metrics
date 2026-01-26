"""Versioned API router for dashboard services."""

from fastapi import APIRouter, Depends

from app.api.routes.v1.dashboards import router as dashboards_router
from app.core.auth import require_neon_auth

router = APIRouter(dependencies=[Depends(require_neon_auth)])
router.include_router(dashboards_router)
