from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import pytest

from src.api.deps import get_current_active_user
from src.db.session import get_db_session
from src.main import app
from src.models.enums import NotificationType
from src.models.notification import Notification
from src.services.notification import create_notification, mark_as_read
from tests.conftest import DummyResult, DummySession


async def _override_session():
    yield object()


async def _override_user():
    return SimpleNamespace(id=1, is_active=True)


@pytest.mark.asyncio
async def test_create_notification_persists_payload_and_nullable_refs(
    dummy_session: DummySession,
) -> None:
    dummy_session.execute_results = [DummyResult(scalar_one_or_none=None)]

    notification = await create_notification(
        dummy_session,
        user_id=1,
        type=NotificationType.DEADLINE_SOON,
        title="Дедлайн скоро закончится",
        message="До дедлайна осталось меньше 60 минут.",
        payload={"event": "deadline_soon"},
        dedupe_key="deadline_soon:task:1:user:1:minutes:60",
    )

    assert notification is not None
    assert dummy_session.committed is True
    assert dummy_session.items[0].user_id == 1
    assert dummy_session.items[0].workspace_id is None
    assert dummy_session.items[0].task_id is None
    assert dummy_session.items[0].payload == {"event": "deadline_soon"}


@pytest.mark.asyncio
async def test_create_notification_returns_none_for_existing_dedupe_key(
    dummy_session: DummySession,
) -> None:
    existing = Notification(
        id=7,
        user_id=1,
        type=NotificationType.WORKSPACE_MEMBER_ADDED,
        title="title",
        message="message",
        dedupe_key="workspace_member_added:workspace:1:user:1",
    )
    dummy_session.execute_results = [DummyResult(scalar_one_or_none=existing)]

    notification = await create_notification(
        dummy_session,
        user_id=1,
        type=NotificationType.WORKSPACE_MEMBER_ADDED,
        title="Вас добавили в рабочее пространство",
        message="Вас добавили в рабочее пространство «Team».",
        workspace_id=1,
        dedupe_key="workspace_member_added:workspace:1:user:1",
    )

    assert notification is None
    assert dummy_session.items == []
    assert dummy_session.committed is False


@pytest.mark.asyncio
async def test_mark_as_read_updates_only_loaded_user_notification(
    dummy_session: DummySession,
) -> None:
    notification = Notification(
        id=5,
        user_id=1,
        type=NotificationType.WORKSPACE_MEMBER_REMOVED,
        title="Вас удалили из рабочего пространства",
        message="Вас удалили из рабочего пространства «Team».",
        is_read=False,
    )
    dummy_session.execute_results = [DummyResult(scalar_one_or_none=notification)]

    updated = await mark_as_read(dummy_session, user_id=1, notification_id=5)

    assert updated is notification
    assert notification.is_read is True
    assert notification.read_at is not None
    assert dummy_session.committed is True


@pytest.mark.asyncio
async def test_notifications_api_requires_auth(test_client) -> None:
    response = await test_client.get("/api/v1/notifications")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_notifications_api_returns_current_user_notifications(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created_at = datetime(2026, 6, 19, 10, 0, tzinfo=UTC)

    async def fake_list_user_notifications(_session, *, user_id, limit, offset, unread_only):
        assert user_id == 1
        assert limit == 10
        assert offset == 0
        assert unread_only is True
        return (
            [
                SimpleNamespace(
                    id=1,
                    type=NotificationType.DEADLINE_SOON,
                    title="Дедлайн скоро закончится",
                    message="До дедлайна осталось меньше 60 минут.",
                    payload=None,
                    workspace_id=None,
                    task_id=None,
                    is_read=False,
                    created_at=created_at,
                    read_at=None,
                )
            ],
            1,
            1,
        )

    monkeypatch.setattr(
        "src.api.v1.notifications.list_user_notifications",
        fake_list_user_notifications,
    )
    app.dependency_overrides[get_db_session] = _override_session
    app.dependency_overrides[get_current_active_user] = _override_user
    try:
        response = await test_client.get(
            "/api/v1/notifications",
            params={"limit": "10", "unread_only": "true"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["unread_count"] == 1
    assert data["items"][0]["type"] == "deadline_soon"


@pytest.mark.asyncio
async def test_deadline_scan_creates_deduped_notification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.tasks import notifications as notification_tasks

    created: list[dict[str, object]] = []
    enqueued: list[int] = []
    today = datetime.now(UTC).date()
    task = SimpleNamespace(
        id=10,
        title="Закрыть релиз",
        deadline=today,
        is_completed=False,
        workspace_id=2,
        assignee=SimpleNamespace(id=5, is_active=True),
        created_by=SimpleNamespace(id=1, is_active=True),
        workspace=SimpleNamespace(name="Engineering"),
    )

    class DummyFactory:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, exc_type, exc, tb):
            return False

    async def fake_load_tasks(_session, _start_date, _end_date):
        return [task]

    async def fake_create_notification(_session, **kwargs):
        created.append(kwargs)
        return SimpleNamespace(id=99)

    monkeypatch.setattr(notification_tasks, "AsyncSessionFactory", lambda: DummyFactory())
    monkeypatch.setattr(notification_tasks, "_load_deadline_candidate_tasks", fake_load_tasks)
    monkeypatch.setattr(notification_tasks, "create_notification", fake_create_notification)
    monkeypatch.setattr(notification_tasks, "_enqueue_delivery_from_worker", enqueued.append)
    monkeypatch.setattr(notification_tasks.settings, "deadline_reminder_minutes", 24 * 60)

    count = await notification_tasks.scan_deadline_notifications_async()

    assert count == 1
    assert created[0]["user_id"] == 5
    assert created[0]["type"] == NotificationType.DEADLINE_SOON
    assert created[0]["workspace_id"] == 2
    assert created[0]["task_id"] == 10
    assert created[0]["dedupe_key"] == "deadline_soon:task:10:user:5:minutes:1440"
    assert enqueued == [99]


@pytest.mark.asyncio
async def test_deadline_scan_skips_completed_and_overdue_tasks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.tasks import notifications as notification_tasks

    created: list[dict[str, object]] = []
    yesterday = datetime.now(UTC).date() - timedelta(days=1)
    completed = SimpleNamespace(
        id=11,
        title="Готовая задача",
        deadline=date.today(),
        is_completed=True,
        workspace_id=2,
        assignee=SimpleNamespace(id=5, is_active=True),
        created_by=None,
        workspace=None,
    )
    overdue = SimpleNamespace(
        id=12,
        title="Просроченная задача",
        deadline=yesterday,
        is_completed=False,
        workspace_id=2,
        assignee=SimpleNamespace(id=5, is_active=True),
        created_by=None,
        workspace=None,
    )

    class DummyFactory:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, exc_type, exc, tb):
            return False

    async def fake_load_tasks(_session, _start_date, _end_date):
        return [completed, overdue]

    async def fake_create_notification(_session, **kwargs):
        created.append(kwargs)
        return SimpleNamespace(id=100)

    monkeypatch.setattr(notification_tasks, "AsyncSessionFactory", lambda: DummyFactory())
    monkeypatch.setattr(notification_tasks, "_load_deadline_candidate_tasks", fake_load_tasks)
    monkeypatch.setattr(notification_tasks, "create_notification", fake_create_notification)
    monkeypatch.setattr(notification_tasks.settings, "deadline_reminder_minutes", 24 * 60)

    count = await notification_tasks.scan_deadline_notifications_async()

    assert count == 0
    assert created == []
