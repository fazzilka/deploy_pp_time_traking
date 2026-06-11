from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, status

from src.api.deps import get_current_active_user
from src.db.session import get_db_session
from src.main import app


def _project(**overrides):
    now = datetime(2026, 6, 1, 10, 0, tzinfo=UTC)
    return SimpleNamespace(
        id=overrides.get("id", 1),
        name=overrides.get("name", "Разработка backend"),
        description=overrides.get("description", "API и база данных"),
        color=overrides.get("color", "#1f6feb"),
        is_archived=overrides.get("is_archived", False),
        created_at=overrides.get("created_at", now),
        updated_at=overrides.get("updated_at", now),
    )


@pytest.mark.asyncio
async def test_create_project_returns_created_project(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def override_session():
        yield object()

    async def override_user():
        return SimpleNamespace(id=1)

    async def fake_create_project(_session, user_id, payload):
        assert user_id == 1
        assert payload.name == "Учёба"
        return _project(name="Учёба", color="#2ea043")

    monkeypatch.setattr("src.api.v1.projects.create_project", fake_create_project)
    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.post(
            "/api/v1/projects",
            json={"name": " Учёба ", "description": "Курсы", "color": "#2ea043"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Учёба"
    assert data["color"] == "#2ea043"


@pytest.mark.asyncio
async def test_create_project_rejects_duplicate_name(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def override_session():
        yield object()

    async def override_user():
        return SimpleNamespace(id=1)

    async def fake_create_project(*_args, **_kwargs):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Проект с таким названием уже существует",
        )

    monkeypatch.setattr("src.api.v1.projects.create_project", fake_create_project)
    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.post(
            "/api/v1/projects",
            json={"name": "Учёба", "color": "#2ea043"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 409
    assert response.json()["detail"] == "Проект с таким названием уже существует"


@pytest.mark.asyncio
async def test_create_project_rejects_invalid_color(test_client) -> None:
    async def override_session():
        yield object()

    async def override_user():
        return SimpleNamespace(id=1)

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.post(
            "/api/v1/projects",
            json={"name": "Учёба", "color": "green"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_list_projects_passes_archive_flag(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def override_session():
        yield object()

    async def override_user():
        return SimpleNamespace(id=1)

    async def fake_list_projects(_session, user_id, *, include_archived=False, search=None):
        assert user_id == 1
        assert include_archived is True
        assert search == "dev"
        project = _project()
        return [
            SimpleNamespace(
                **project.__dict__,
                tasks_count=2,
                active_tasks_count=1,
                tasks_with_time_count=2,
                total_time_seconds=120,
            )
        ]

    monkeypatch.setattr("src.api.v1.projects.list_projects", fake_list_projects)
    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.get(
            "/api/v1/projects",
            params={"include_archived": "true", "search": "dev"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data[0]["tasks_count"] == 2
    assert data[0]["active_tasks_count"] == 1


@pytest.mark.asyncio
async def test_get_project_returns_404_for_other_user(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def override_session():
        yield object()

    async def override_user():
        return SimpleNamespace(id=1)

    async def fake_get_project_or_404(*_args, **_kwargs):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Проект не найден")

    monkeypatch.setattr("src.api.v1.projects.get_project_or_404", fake_get_project_or_404)
    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.get("/api/v1/projects/99")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_project_tasks_returns_project_badge(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def override_session():
        yield object()

    async def override_user():
        return SimpleNamespace(id=1)

    async def fake_fetch_tasks(*_args, **_kwargs):
        return [
            SimpleNamespace(
                id=10,
                title="Задача проекта",
                description="",
                total_time_seconds=60,
                deadline=None,
                priority="medium",
                project_id=1,
                project=_project(id=1, name="Учёба", color="#2ea043"),
                intervals=[],
            )
        ]

    monkeypatch.setattr("src.api.v1.projects.fetch_tasks", fake_fetch_tasks)
    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.get("/api/v1/projects/1/tasks")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data[0]["project_id"] == 1
    assert data[0]["project"]["name"] == "Учёба"


@pytest.mark.asyncio
async def test_projects_summary_endpoint_returns_unassigned_group(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def override_session():
        yield object()

    async def override_user():
        return SimpleNamespace(id=1)

    async def fake_build_projects_summary(*_args, **_kwargs):
        return SimpleNamespace(
            total_time_seconds=300,
            items=[
                {
                    "project_id": None,
                    "name": "Без проекта",
                    "color": "#8b949e",
                    "tasks_count": 1,
                    "active_tasks_count": 0,
                    "total_time_seconds": 300,
                    "percentage": 100.0,
                }
            ],
        )

    monkeypatch.setattr("src.api.v1.summary.build_projects_summary", fake_build_projects_summary)
    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.get("/api/v1/summary/projects")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["total_time_seconds"] == 300
    assert data["items"][0]["name"] == "Без проекта"
