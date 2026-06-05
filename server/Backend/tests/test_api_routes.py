from __future__ import annotations

from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, status

from src.api.deps import get_current_active_user
from src.db.session import get_db_session
from src.main import app
from tests.conftest import DummyResult


@pytest.mark.asyncio
async def test_health_endpoint(test_client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_check_db(_session):
        return None

    async def fake_check_schema(_session):
        return None

    class DummyFactory:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("src.main._check_db", fake_check_db)
    monkeypatch.setattr("src.main._check_schema", fake_check_schema)
    monkeypatch.setattr("src.main.AsyncSessionFactory", lambda: DummyFactory())

    response = await test_client.get("/health")

    assert response.status_code == 200
    assert response.json()["database"] == "ok"
    assert response.json()["schema"] == "ok"


@pytest.mark.asyncio
async def test_health_endpoint_schema_missing_returns_503(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_check_db(_session):
        return None

    async def fake_check_schema(_session):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database schema is not ready",
        )

    class DummyFactory:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("src.main._check_db", fake_check_db)
    monkeypatch.setattr("src.main._check_schema", fake_check_schema)
    monkeypatch.setattr("src.main.AsyncSessionFactory", lambda: DummyFactory())

    response = await test_client.get("/health")

    assert response.status_code == 503
    assert response.json()["detail"] == "Database schema is not ready"


@pytest.mark.asyncio
async def test_list_tasks_filters_and_search(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
    dummy_session,
) -> None:
    dummy_session.execute_results = [
        DummyResult(
            scalar_one=[
                SimpleNamespace(
                    id=1,
                    title="Задача",
                    description="",
                    total_time_seconds=5,
                    deadline=date(2026, 5, 30),
                    priority="high",
                    intervals=[],
                )
            ]
        )
    ]

    async def override_session():
        yield dummy_session

    async def override_user():
        return SimpleNamespace(id=1)

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.get(
            "/api/v1/tasks",
            params={
                "search": "Зад",
                "has_time": "true",
                "priority": "high",
                "deadline_before": "2026-06-01",
                "deadline_after": "2026-05-01",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Задача"
    assert data[0]["deadline"] == "2026-05-30"
    assert data[0]["priority"] == "high"


@pytest.mark.asyncio
async def test_list_tasks_invalid_priority_returns_422(
    test_client,
    dummy_session,
) -> None:
    async def override_session():
        yield dummy_session

    async def override_user():
        return SimpleNamespace(id=1)

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.get("/api/v1/tasks", params={"priority": "urgent"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_list_tasks_accepts_limit_and_offset(
    test_client,
    dummy_session,
) -> None:
    dummy_session.execute_results = [DummyResult(scalar_one=[])]

    async def override_session():
        yield dummy_session

    async def override_user():
        return SimpleNamespace(id=1)

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.get("/api/v1/tasks", params={"limit": "25", "offset": "50"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_list_tasks_rejects_limit_above_maximum(
    test_client,
    dummy_session,
) -> None:
    async def override_session():
        yield dummy_session

    async def override_user():
        return SimpleNamespace(id=1)

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.get("/api/v1/tasks", params={"limit": "101"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_task_accepts_deadline_and_priority(test_client, dummy_session) -> None:
    dummy_session.execute_results = [
        DummyResult(
            scalar_one_or_none=SimpleNamespace(
                id=10,
                title="Дедлайн задача",
                description="Описание",
                total_time_seconds=0,
                deadline=date(2026, 5, 30),
                priority="highest",
                intervals=[],
            )
        )
    ]

    async def override_session():
        yield dummy_session

    async def override_user():
        return SimpleNamespace(id=1)

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.post(
            "/api/v1/tasks",
            json={
                "title": "Дедлайн задача",
                "description": "Описание",
                "deadline": "2026-05-30",
                "priority": "highest",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert dummy_session.items[0].deadline == date(2026, 5, 30)
    assert dummy_session.items[0].priority == "highest"
    data = response.json()
    assert data["deadline"] == "2026-05-30"
    assert data["priority"] == "highest"


@pytest.mark.asyncio
async def test_create_task_defaults_deadline_and_priority(test_client, dummy_session) -> None:
    dummy_session.execute_results = [
        DummyResult(
            scalar_one_or_none=SimpleNamespace(
                id=11,
                title="Обычная задача",
                description="",
                total_time_seconds=0,
                deadline=None,
                priority="medium",
                intervals=[],
            )
        )
    ]

    async def override_session():
        yield dummy_session

    async def override_user():
        return SimpleNamespace(id=1)

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.post("/api/v1/tasks", json={"title": "Обычная задача"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert dummy_session.items[0].deadline is None
    assert dummy_session.items[0].priority == "medium"
    data = response.json()
    assert data["deadline"] is None
    assert data["priority"] == "medium"


@pytest.mark.asyncio
async def test_update_task_changes_deadline_and_priority(test_client, dummy_session) -> None:
    task = SimpleNamespace(
        id=12,
        title="Задача",
        description="",
        total_time_seconds=0,
        deadline=None,
        priority="medium",
        intervals=[],
    )
    dummy_session.execute_results = [
        DummyResult(scalar_one_or_none=task),
        DummyResult(scalar_one_or_none=task),
    ]

    async def override_session():
        yield dummy_session

    async def override_user():
        return SimpleNamespace(id=1)

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.patch(
            "/api/v1/tasks/12",
            json={"deadline": "2026-06-01", "priority": "low"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert task.deadline == date(2026, 6, 1)
    assert task.priority == "low"
    data = response.json()
    assert data["deadline"] == "2026-06-01"
    assert data["priority"] == "low"


@pytest.mark.asyncio
async def test_list_tasks_uses_frontend_interval_field_names(
    test_client,
    dummy_session,
) -> None:
    dummy_session.execute_results = [
        DummyResult(
            scalar_one=[
                SimpleNamespace(
                    id=1,
                    title="Задача с таймером",
                    description="",
                    total_time_seconds=0,
                    intervals=[
                        SimpleNamespace(
                            id=10,
                            started_at=datetime(2026, 5, 18, 10, 0, tzinfo=UTC),
                            finished_at=None,
                        )
                    ],
                )
            ]
        )
    ]

    async def override_session():
        yield dummy_session

    async def override_user():
        return SimpleNamespace(id=1)

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.get("/api/v1/tasks")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert "intervals" not in data[0]
    assert data[0]["time_intervals"][0]["ended_at"] is None
    assert "finished_at" not in data[0]["time_intervals"][0]


@pytest.mark.asyncio
async def test_summary_uses_frontend_total_field_name(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def override_session():
        yield object()

    async def override_user():
        return SimpleNamespace(id=1)

    async def fake_build_summary(*_args, **_kwargs):
        return SimpleNamespace(
            total_time_seconds_all_tasks=120,
            tasks_with_time_count=1,
            top_tasks=[
                SimpleNamespace(
                    id=1,
                    title="Самая долгая задача",
                    description="Описание",
                    total_time_seconds=120,
                    intervals=[],
                )
            ],
        )

    monkeypatch.setattr("src.api.v1.summary.build_summary", fake_build_summary)
    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.get("/api/v1/summary?limit=3")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["total_time_seconds_all_tasks"] == 120
    assert "total_time_seconds" not in data
    assert data["tasks_with_time_count"] == 1
    assert data["top_tasks"] == [
        {
            "id": 1,
            "title": "Самая долгая задача",
            "description": "Описание",
            "total_time_seconds": 120,
            "deadline": None,
            "priority": "medium",
        }
    ]


@pytest.mark.asyncio
async def test_delete_task_not_found_returns_404(test_client, dummy_session) -> None:
    dummy_session.execute_results = [DummyResult(scalar_one_or_none=None)]

    async def override_session():
        yield dummy_session

    async def override_user():
        return SimpleNamespace(id=1)

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.delete("/api/v1/tasks/99")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_task_not_found_returns_404(test_client, dummy_session) -> None:
    dummy_session.execute_results = [DummyResult(scalar_one_or_none=None)]

    async def override_session():
        yield dummy_session

    async def override_user():
        return SimpleNamespace(id=1)

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.get("/api/v1/tasks/99")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
