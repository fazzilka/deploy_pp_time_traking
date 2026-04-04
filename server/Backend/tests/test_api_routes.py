from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException, status

from src.db.session import get_db_session
from src.main import app
from src.models.task import Task
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
                    intervals=[],
                )
            ]
        )
    ]

    async def override_session():
        yield dummy_session

    app.dependency_overrides[get_db_session] = override_session
    try:
        response = await test_client.get(
            "/api/v1/tasks",
            params={"search": "Зад", "has_time": "true"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Задача"


@pytest.mark.asyncio
async def test_delete_task_not_found_returns_404(test_client, dummy_session) -> None:
    dummy_session.get_map[(Task, 99)] = None

    async def override_session():
        yield dummy_session

    app.dependency_overrides[get_db_session] = override_session
    try:
        response = await test_client.delete("/api/v1/tasks/99")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
