from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from src.api.deps import CurrentUserDep
from src.services.user_events import UserEvent, user_event_manager

router = APIRouter(prefix="/events", tags=["events"])

HEARTBEAT_SECONDS = 25


def _format_sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.get("/stream")
async def stream_user_events(
    request: Request,
    current_user: CurrentUserDep,
) -> StreamingResponse:
    async def event_generator() -> AsyncIterator[str]:
        queue = await user_event_manager.connect(current_user.id)
        try:
            yield _format_sse("ping", {})
            while not await request.is_disconnected():
                try:
                    user_event: UserEvent = await asyncio.wait_for(
                        queue.get(),
                        timeout=HEARTBEAT_SECONDS,
                    )
                except TimeoutError:
                    yield _format_sse("ping", {})
                    continue

                yield _format_sse(user_event.event, user_event.data)
        finally:
            await user_event_manager.disconnect(current_user.id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
