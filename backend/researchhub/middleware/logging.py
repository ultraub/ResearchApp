"""Structured logging middleware."""

import time
from typing import Callable

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger()


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for structured request/response logging."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Log request and response with timing information."""
        start_time = time.perf_counter()

        # Get request ID from state (set by RequestIDMiddleware)
        request_id = getattr(request.state, "request_id", "unknown")

        # Bind request context to logger
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            client_ip=request.client.host if request.client else "unknown",
        )

        # Log request start
        logger.info("request_started")

        try:
            response = await call_next(request)
            process_time = time.perf_counter() - start_time

            # Log successful response
            logger.info(
                "request_completed",
                status_code=response.status_code,
                duration_ms=round(process_time * 1000, 2),
            )

            # Add timing header
            response.headers["X-Process-Time"] = str(round(process_time * 1000, 2))

            return response

        except Exception as exc:
            process_time = time.perf_counter() - start_time
            logger.exception(
                "request_failed",
                error=str(exc),
                duration_ms=round(process_time * 1000, 2),
            )
            raise
