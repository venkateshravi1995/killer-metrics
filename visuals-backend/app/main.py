"""FastAPI application entrypoint for the visuals backend."""

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exception_handlers import (
    http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.health import router as health_router
from app.api.routes.v1.router import router as v1_router
from app.db.session import DatabaseConfigError, DatabaseError, close_engine

SERVER_ERROR_THRESHOLD = 500


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Manage application startup/shutdown lifecycle."""
    yield
    await close_engine()


app = FastAPI(title="Dashboarding API", lifespan=lifespan)
logger = logging.getLogger("metric_killer.dashboarding")
CACHE_CONTROL_HEADER = "public, max-age=300"

cors_origins = [
    origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if cors_origins else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(v1_router)


@app.middleware("http")
async def attach_cache_control_header(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["Cache-Control"] = CACHE_CONTROL_HEADER
    return response


@app.exception_handler(DatabaseConfigError)
async def database_config_error_handler(
    request: Request,
    _exc: DatabaseConfigError,
) -> JSONResponse:
    """Handle database configuration errors."""
    logger.exception(
        "Database config error on %s %s",
        request.method,
        request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Dashboarding database configuration error."},
    )


@app.exception_handler(DatabaseError)
async def database_error_handler(
    request: Request,
    _exc: DatabaseError,
) -> JSONResponse:
    """Handle database errors during request processing."""
    logger.exception(
        "Database error on %s %s",
        request.method,
        request.url.path,
    )
    return JSONResponse(
        status_code=503,
        content={"detail": "Dashboarding database temporarily unavailable."},
    )


@app.exception_handler(HTTPException)
async def http_exception_logger(
    request: Request,
    exc: HTTPException,
) -> Response:
    """Log HTTP exceptions and delegate to FastAPI handler."""
    level = logging.ERROR if exc.status_code >= SERVER_ERROR_THRESHOLD else logging.INFO
    logger.log(
        level,
        "HTTP %s on %s %s",
        exc.status_code,
        request.method,
        request.url.path,
    )
    return await http_exception_handler(request, exc)


@app.exception_handler(RequestValidationError)
async def validation_exception_logger(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Log validation errors and delegate to FastAPI handler."""
    logger.warning(
        "Validation error on %s %s: %s",
        request.method,
        request.url.path,
        exc.errors(),
    )
    return await request_validation_exception_handler(request, exc)


@app.exception_handler(Exception)
async def unhandled_exception_handler(
    request: Request,
    _exc: Exception,
) -> JSONResponse:
    """Handle unexpected exceptions with a generic 500 response."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error."},
    )
