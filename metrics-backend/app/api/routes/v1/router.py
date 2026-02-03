"""Versioned API router."""

from fastapi import APIRouter, Depends

from app.api.routes.v1.dimensions import router as dimensions_router
from app.api.routes.v1.metrics import router as metrics_router
from app.api.routes.v1.queries import router as queries_router
from app.core.auth import require_local_auth

router = APIRouter(dependencies=[Depends(require_local_auth)])
router.include_router(metrics_router)
router.include_router(dimensions_router)
router.include_router(queries_router)
