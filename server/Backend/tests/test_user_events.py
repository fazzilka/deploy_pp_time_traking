from __future__ import annotations

from typing import Any

import pytest

from src.services.user_events import UserEventManager, publish_workspace_event


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


class _ScalarRows:
    def __init__(self, rows: list[int]) -> None:
        self._rows = rows

    def all(self) -> list[int]:
        return self._rows


class _ExecuteResult:
    def __init__(self, rows: list[int]) -> None:
        self._rows = rows

    def scalars(self) -> _ScalarRows:
        return _ScalarRows(self._rows)


class _PublishSession:
    async def execute(self, _stmt: Any) -> _ExecuteResult:
        return _ExecuteResult([1, 3])


@pytest.mark.asyncio
async def test_publish_workspace_event_sends_to_workspace_members(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent_events: list[tuple[int, str, dict[str, Any]]] = []

    async def fake_publish_user_event(user_id: int, event: str, data: dict[str, Any]) -> None:
        sent_events.append((user_id, event, data))

    monkeypatch.setattr("src.services.user_events.publish_user_event", fake_publish_user_event)

    await publish_workspace_event(
        _PublishSession(),
        10,
        "task_updated",
        {"task_id": 20, "changed_fields": ["title"]},
    )

    assert sent_events == [
        (1, "task_updated", {"workspace_id": 10, "task_id": 20, "changed_fields": ["title"]}),
        (3, "task_updated", {"workspace_id": 10, "task_id": 20, "changed_fields": ["title"]}),
    ]
