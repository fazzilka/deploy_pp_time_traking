from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.enums import WorkspaceMemberStatus
from src.models.workspace import WorkspaceMember

logger = logging.getLogger(__name__)

MAX_QUEUE_SIZE = 100


@dataclass(frozen=True)
class UserEvent:
    event: str
    data: dict[str, Any]


class UserEventManager:
    def __init__(self) -> None:
        self._connections: dict[int, set[asyncio.Queue[UserEvent]]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, user_id: int) -> asyncio.Queue[UserEvent]:
        queue: asyncio.Queue[UserEvent] = asyncio.Queue(maxsize=MAX_QUEUE_SIZE)
        async with self._lock:
            self._connections[user_id].add(queue)
        logger.info("sse_client_connected", extra={"user_id": user_id})
        return queue

    async def disconnect(self, user_id: int, queue: asyncio.Queue[UserEvent]) -> None:
        async with self._lock:
            queues = self._connections.get(user_id)
            if queues is None:
                return
            queues.discard(queue)
            if not queues:
                self._connections.pop(user_id, None)
        logger.info("sse_client_disconnected", extra={"user_id": user_id})

    async def publish(self, user_id: int, event: str, data: dict[str, Any]) -> None:
        payload = {
            "type": event,
            "created_at": datetime.now(UTC).isoformat(),
            **data,
        }
        async with self._lock:
            queues = list(self._connections.get(user_id, set()))

        if not queues:
            return

        user_event = UserEvent(event=event, data=payload)
        sent_count = 0
        for queue in queues:
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(user_event)
                sent_count += 1
            except asyncio.QueueFull:
                logger.warning(
                    "sse_event_failed",
                    extra={"user_id": user_id, "event": event, "reason": "queue_full"},
                )

        logger.info(
            "sse_event_sent",
            extra={"user_id": user_id, "event": event, "connections": sent_count},
        )


user_event_manager = UserEventManager()


async def publish_user_event(user_id: int, event: str, data: dict[str, Any]) -> None:
    await user_event_manager.publish(user_id, event, data)


async def publish_workspace_event(
    session: AsyncSession,
    workspace_id: int,
    event: str,
    data: dict[str, Any],
) -> None:
    result = await session.execute(
        select(WorkspaceMember.user_id).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.status == WorkspaceMemberStatus.ACTIVE,
        )
    )
    user_ids = [int(user_id) for user_id in result.scalars().all()]
    for user_id in user_ids:
        await publish_user_event(
            user_id,
            event,
            {
                "workspace_id": workspace_id,
                **data,
            },
        )
