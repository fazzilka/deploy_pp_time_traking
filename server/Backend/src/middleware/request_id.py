import time
import uuid
from collections.abc import Awaitable, Callable
from contextvars import ContextVar

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

request_id_context: ContextVar[str] = ContextVar("request_id", default="")


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        token = request_id_context.set(request_id)
        started = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            request_id_context.reset(token)
        response.headers["X-Request-Id"] = request_id
        response.headers["X-Response-Time-Ms"] = f"{(time.perf_counter() - started) * 1000:.2f}"
        return response
