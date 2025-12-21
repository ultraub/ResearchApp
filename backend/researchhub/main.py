"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from researchhub.api import router as api_router
from researchhub.config import get_settings
from researchhub.db.session import close_db, init_db
from researchhub.middleware.logging import LoggingMiddleware
from researchhub.middleware.request_id import RequestIDMiddleware

logger = structlog.get_logger()
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager for startup/shutdown events."""
    # Startup
    logger.info("Starting Pasteur API", version=settings.app_version)
    await init_db()
    logger.info("Database connection initialized")

    yield

    # Shutdown
    logger.info("Shutting down Pasteur API")
    await close_db()
    logger.info("Database connection closed")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Research project management system for academic and clinical research teams",
        openapi_url=f"{settings.api_prefix}/openapi.json",
        docs_url=f"{settings.api_prefix}/docs",
        redoc_url=f"{settings.api_prefix}/redoc",
        default_response_class=ORJSONResponse,
        lifespan=lifespan,
    )

    # Add middleware (order matters - last added is first executed)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(LoggingMiddleware)
    app.add_middleware(RequestIDMiddleware)
    # Trust proxy headers (X-Forwarded-Proto, X-Forwarded-For) from nginx
    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])

    # Include API router
    app.include_router(api_router, prefix=settings.api_prefix)

    return app


app = create_app()


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint for load balancers."""
    return {"status": "healthy", "version": settings.app_version}
