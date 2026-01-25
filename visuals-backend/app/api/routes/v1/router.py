from fastapi import APIRouter

from app.api.routes.v1.dashboards import router as dashboards_router

router = APIRouter()
router.include_router(dashboards_router)
