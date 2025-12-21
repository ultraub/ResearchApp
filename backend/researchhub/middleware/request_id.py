"""Request ID middleware for request tracing."""

import uuid
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-ID"


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Middleware that ensures every request has a unique ID for tracing."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Add request ID to request state and response headers."""
        # Get or generate request ID
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())

        # Store in request state for access throughout the request lifecycle
        request.state.request_id = request_id

        # Process request
        response = await call_next(request)

        # Add request ID to response headers
        response.headers[REQUEST_ID_HEADER] = request_id

        return response
