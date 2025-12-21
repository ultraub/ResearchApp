"""Health check endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.config import get_settings
from researchhub.db.session import get_db_session

router = APIRouter()
settings = get_settings()


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Basic health check."""
    return {
        "status": "healthy",
        "version": settings.app_version,
        "environment": settings.environment,
    }


@router.get("/health/ready")
async def readiness_check(
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, str | dict[str, str]]:
    """Readiness check including database connectivity."""
    checks: dict[str, str] = {}

    # Check database
    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "healthy"
    except Exception as e:
        checks["database"] = f"unhealthy: {str(e)}"

    overall_status = "healthy" if all(v == "healthy" for v in checks.values()) else "unhealthy"

    return {
        "status": overall_status,
        "version": settings.app_version,
        "checks": checks,
    }
