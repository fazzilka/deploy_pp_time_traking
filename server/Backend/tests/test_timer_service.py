from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from src.services import timer as timer_service


class DummyTx:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class DummySession:
    def __init__(self) -> None:
        self.added: list[object] = []

    def begin(self) -> DummyTx:
        return DummyTx()

    def add(self, item: object) -> None:
        self.added.append(item)

    async def refresh(self, _task: object) -> None:
        return None


@pytest.mark.asyncio
async def test_start_timer_creates_interval(monkeypatch: pytest.MonkeyPatch) -> None:
    session = DummySession()
    task = SimpleNamespace(id=1)

    async def fake_get_task_for_update(_session, _task_id, _user_id):
        return task

    async def fake_get_active_interval(_session, _task_id):
        return None

    monkeypatch.setattr(timer_service, "_get_task_for_update", fake_get_task_for_update)
    monkeypatch.setattr(timer_service, "_get_active_interval", fake_get_active_interval)
    monkeypatch.setattr(timer_service, "utc_now", lambda: datetime(2026, 2, 23, tzinfo=UTC))

    result = await timer_service.start_timer(session, 1, 10)

    assert result is task
    assert len(session.added) == 1
    interval = session.added[0]
    assert interval.task_id == 1
    assert interval.finished_at is None


@pytest.mark.asyncio
async def test_start_timer_conflict(monkeypatch: pytest.MonkeyPatch) -> None:
    session = DummySession()

    async def fake_get_task_for_update(_session, _task_id, _user_id):
        return SimpleNamespace(id=1)

    async def fake_get_active_interval(_session, _task_id):
        return SimpleNamespace(id=10)

    monkeypatch.setattr(timer_service, "_get_task_for_update", fake_get_task_for_update)
    monkeypatch.setattr(timer_service, "_get_active_interval", fake_get_active_interval)

    with pytest.raises(HTTPException) as exc:
        await timer_service.start_timer(session, 1, 10)

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_start_timer_checks_active_interval_only_for_requested_task(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = DummySession()
    checked_task_ids: list[int] = []

    async def fake_get_task_for_update(_session, _task_id, _user_id):
        return SimpleNamespace(id=_task_id)

    async def fake_get_active_interval(_session, task_id):
        checked_task_ids.append(task_id)
        return None

    monkeypatch.setattr(timer_service, "_get_task_for_update", fake_get_task_for_update)
    monkeypatch.setattr(timer_service, "_get_active_interval", fake_get_active_interval)
    monkeypatch.setattr(timer_service, "utc_now", lambda: datetime(2026, 2, 23, tzinfo=UTC))

    await timer_service.start_timer(session, 2, 10)

    assert checked_task_ids == [2]
    assert len(session.added) == 1


@pytest.mark.asyncio
async def test_stop_timer_updates_total_time(monkeypatch: pytest.MonkeyPatch) -> None:
    session = DummySession()
    task = SimpleNamespace(id=1, total_time_seconds=5)
    active_interval = SimpleNamespace(
        started_at=datetime(2026, 2, 23, 12, 0, tzinfo=UTC),
        finished_at=None,
    )

    async def fake_get_task_for_update(_session, _task_id, _user_id):
        return task

    async def fake_get_active_interval(_session, _task_id):
        return active_interval

    monkeypatch.setattr(timer_service, "_get_task_for_update", fake_get_task_for_update)
    monkeypatch.setattr(timer_service, "_get_active_interval", fake_get_active_interval)
    monkeypatch.setattr(
        timer_service,
        "utc_now",
        lambda: datetime(2026, 2, 23, 12, 1, 30, tzinfo=UTC),
    )

    await timer_service.stop_timer(session, 1, 10)

    assert task.total_time_seconds == 95
    assert active_interval.finished_at is not None
