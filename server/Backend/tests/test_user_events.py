from __future__ import annotations

import pytest

from src.services.user_events import UserEventManager


@pytest.mark.asyncio
async def test_user_event_manager_publishes_to_user_connections_only() -> None:
    manager = UserEventManager()
    user_queue = await manager.connect(1)
    second_user_queue = await manager.connect(2)

    await manager.publish(
        1,
        "workspace.membership.changed",
        {"reason": "added", "workspace_id": 7},
    )

    event = user_queue.get_nowait()
    assert event.event == "workspace.membership.changed"
    assert event.data["reason"] == "added"
    assert event.data["workspace_id"] == 7
    assert event.data["type"] == "workspace.membership.changed"
    assert second_user_queue.empty()

    await manager.disconnect(1, user_queue)
    await manager.disconnect(2, second_user_queue)
