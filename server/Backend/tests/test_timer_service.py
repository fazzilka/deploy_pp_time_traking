from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from src.models.enums import WorkspaceRole
from src.services import task_authorization
from src.services import timer as timer_service


class DummyTx:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class DummySession:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.committed = False

    def begin(self) -> DummyTx:
        return DummyTx()

    def add(self, item: object) -> None:
        self.added.append(item)

    async def commit(self) -> None:
        self.committed = True

    async def refresh(self, _task: object) -> None:
        return None


@pytest.mark.asyncio
async def test_start_timer_creates_interval(monkeypatch: pytest.MonkeyPatch) -> None:
    session = DummySession()
    task = SimpleNamespace(id=1, is_completed=False)

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
    assert session.committed is True


@pytest.mark.asyncio
async def test_start_timer_conflict(monkeypatch: pytest.MonkeyPatch) -> None:
    session = DummySession()

    async def fake_get_task_for_update(_session, _task_id, _user_id):
        return SimpleNamespace(id=1, is_completed=False)

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
        return SimpleNamespace(id=_task_id, is_completed=False)

    async def fake_get_active_interval(_session, task_id):
        checked_task_ids.append(task_id)
        return None

    monkeypatch.setattr(timer_service, "_get_task_for_update", fake_get_task_for_update)
    monkeypatch.setattr(timer_service, "_get_active_interval", fake_get_active_interval)
    monkeypatch.setattr(timer_service, "utc_now", lambda: datetime(2026, 2, 23, tzinfo=UTC))

    await timer_service.start_timer(session, 2, 10)

    assert checked_task_ids == [2]
    assert len(session.added) == 1
    assert session.committed is True


@pytest.mark.asyncio
async def test_start_timer_rejects_completed_task(monkeypatch: pytest.MonkeyPatch) -> None:
    session = DummySession()

    async def fake_get_task_for_update(_session, _task_id, _user_id):
        return SimpleNamespace(id=1, is_completed=True)

    async def fake_get_active_interval(_session, _task_id):
        raise AssertionError("completed task should be rejected before interval lookup")

    monkeypatch.setattr(timer_service, "_get_task_for_update", fake_get_task_for_update)
    monkeypatch.setattr(timer_service, "_get_active_interval", fake_get_active_interval)

    with pytest.raises(HTTPException) as exc:
        await timer_service.start_timer(session, 1, 10)

    assert exc.value.status_code == 400
    assert exc.value.detail == "Нельзя запустить таймер для завершённой задачи"
    assert session.added == []


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
    assert session.committed is True


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [WorkspaceRole.OWNER, WorkspaceRole.TEAM_LEAD])
async def test_task_timer_policy_allows_owner_and_team_lead(
    monkeypatch: pytest.MonkeyPatch,
    role: WorkspaceRole,
) -> None:
    async def fake_get_active_membership(_session, _user_id, _workspace_id):
        return SimpleNamespace(role=role)

    monkeypatch.setattr(
        task_authorization,
        "get_active_membership",
        fake_get_active_membership,
    )

    task = SimpleNamespace(workspace_id=1, created_by_id=20, assignee_id=30, user_id=20)

    await task_authorization.require_task_update_permission(DummySession(), 10, task)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("task_attrs", "user_id"),
    [
        ({"created_by_id": 10, "assignee_id": 30, "user_id": 20}, 10),
        ({"created_by_id": 20, "assignee_id": 10, "user_id": 20}, 10),
        ({"created_by_id": 20, "assignee_id": 30, "user_id": 10}, 10),
    ],
)
async def test_task_timer_policy_allows_creator_assignee_and_legacy_owner(
    monkeypatch: pytest.MonkeyPatch,
    task_attrs: dict[str, int],
    user_id: int,
) -> None:
    async def fake_get_active_membership(_session, _user_id, _workspace_id):
        return SimpleNamespace(role=WorkspaceRole.MEMBER)

    monkeypatch.setattr(
        task_authorization,
        "get_active_membership",
        fake_get_active_membership,
    )

    task = SimpleNamespace(workspace_id=1, **task_attrs)

    await task_authorization.require_task_update_permission(DummySession(), user_id, task)


@pytest.mark.asyncio
async def test_member_cannot_start_timer_for_someone_elses_task(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_get_active_membership(_session, _user_id, _workspace_id):
        return SimpleNamespace(role=WorkspaceRole.MEMBER)

    monkeypatch.setattr(
        task_authorization,
        "get_active_membership",
        fake_get_active_membership,
    )

    task = SimpleNamespace(workspace_id=1, created_by_id=20, assignee_id=30, user_id=20)

    with pytest.raises(HTTPException) as exc:
        await task_authorization.require_task_update_permission(DummySession(), 10, task)

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_start_or_stop_timer(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_get_active_membership(_session, _user_id, _workspace_id):
        return SimpleNamespace(role=WorkspaceRole.VIEWER)

    monkeypatch.setattr(
        task_authorization,
        "get_active_membership",
        fake_get_active_membership,
    )

    task = SimpleNamespace(workspace_id=1, created_by_id=10, assignee_id=10, user_id=10)

    with pytest.raises(HTTPException) as exc:
        await task_authorization.require_task_update_permission(DummySession(), 10, task)

    assert exc.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["start", "stop"])
async def test_timer_operations_stop_after_authorization_failure(
    monkeypatch: pytest.MonkeyPatch,
    operation: str,
) -> None:
    session = DummySession()

    async def fake_get_task_for_update(_session, _task_id, _user_id):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    async def fake_get_active_interval(_session, _task_id):
        raise AssertionError("timer should not query intervals after forbidden task access")

    monkeypatch.setattr(timer_service, "_get_task_for_update", fake_get_task_for_update)
    monkeypatch.setattr(timer_service, "_get_active_interval", fake_get_active_interval)

    with pytest.raises(HTTPException) as exc:
        if operation == "start":
            await timer_service.start_timer(session, 1, 10)
        else:
            await timer_service.stop_timer(session, 1, 10)

    assert exc.value.status_code == 403
    assert session.committed is False
