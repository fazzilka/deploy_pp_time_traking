from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, status

from src.api.deps import get_current_active_user
from src.db.session import get_db_session
from src.main import app
from src.models.enums import WorkspaceMemberStatus, WorkspaceRole, WorkspaceType
from src.schemas.workspace import (
    WorkspaceMemberRead,
    WorkspaceMemberSummaryItem,
    WorkspaceMemberSummaryResponse,
    WorkspaceMemberUser,
    WorkspaceRead,
)

NOW = datetime(2026, 6, 1, 10, 0, tzinfo=UTC)


def _workspace(**overrides) -> WorkspaceRead:
    return WorkspaceRead(
        id=overrides.get("id", 1),
        name=overrides.get("name", "Личное пространство"),
        description=overrides.get("description"),
        type=overrides.get("type", WorkspaceType.PERSONAL),
        owner_id=overrides.get("owner_id", 1),
        created_at=NOW,
        updated_at=NOW,
        members_count=overrides.get("members_count", 1),
        projects_count=overrides.get("projects_count", 0),
        tasks_count=overrides.get("tasks_count", 0),
        total_time_seconds=overrides.get("total_time_seconds", 0),
        current_user_role=overrides.get("current_user_role", WorkspaceRole.OWNER),
    )


def _member(**overrides) -> WorkspaceMemberRead:
    return WorkspaceMemberRead(
        id=overrides.get("id", 10),
        workspace_id=overrides.get("workspace_id", 1),
        user=WorkspaceMemberUser(
            id=overrides.get("user_id", 2),
            email=overrides.get("email", "member@example.com"),
            username=overrides.get("username", "member"),
            full_name=overrides.get("full_name", "Team Member"),
            avatar_letter="",
            is_active=True,
        ),
        role=overrides.get("role", WorkspaceRole.MEMBER),
        status=WorkspaceMemberStatus.ACTIVE,
        joined_at=NOW,
        projects_count=overrides.get("projects_count", 0),
        tasks_count=overrides.get("tasks_count", 0),
        completed_tasks_count=overrides.get("completed_tasks_count", 0),
        total_time_seconds=overrides.get("total_time_seconds", 0),
    )


async def _override_session():
    yield object()


async def _override_user():
    return SimpleNamespace(id=1)


@pytest.mark.asyncio
async def test_list_workspaces_returns_user_workspaces(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_get_user_workspaces(_session, user):
        assert user.id == 1
        return [_workspace()]

    monkeypatch.setattr("src.api.v1.workspaces.get_user_workspaces", fake_get_user_workspaces)
    app.dependency_overrides[get_db_session] = _override_session
    app.dependency_overrides[get_current_active_user] = _override_user
    try:
        response = await test_client.get("/api/v1/workspaces")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data[0]["name"] == "Личное пространство"
    assert data[0]["current_user_role"] == "owner"


@pytest.mark.asyncio
async def test_create_team_workspace_returns_created_workspace(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_create_workspace(_session, user, payload):
        assert user.id == 1
        assert payload.name == "Engineering"
        return _workspace(id=2, name="Engineering", type=WorkspaceType.TEAM)

    monkeypatch.setattr("src.api.v1.workspaces.create_workspace", fake_create_workspace)
    app.dependency_overrides[get_db_session] = _override_session
    app.dependency_overrides[get_current_active_user] = _override_user
    try:
        response = await test_client.post("/api/v1/workspaces", json={"name": "Engineering"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Engineering"
    assert data["type"] == "team"


@pytest.mark.asyncio
async def test_add_workspace_member_by_email(test_client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_add_member(_session, user, workspace_id, payload):
        assert user.id == 1
        assert workspace_id == 2
        assert payload.email == "member@example.com"
        assert payload.role == WorkspaceRole.MEMBER
        return _member(workspace_id=2, email="member@example.com")

    monkeypatch.setattr("src.api.v1.workspaces.add_workspace_member_by_email", fake_add_member)
    app.dependency_overrides[get_db_session] = _override_session
    app.dependency_overrides[get_current_active_user] = _override_user
    try:
        response = await test_client.post(
            "/api/v1/workspaces/2/members",
            json={"email": "member@example.com", "role": "member"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    data = response.json()
    assert data["workspace_id"] == 2
    assert data["user"]["email"] == "member@example.com"


@pytest.mark.asyncio
async def test_add_workspace_member_returns_duplicate_error(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_add_member(*_args, **_kwargs):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пользователь уже состоит в команде",
        )

    monkeypatch.setattr("src.api.v1.workspaces.add_workspace_member_by_email", fake_add_member)
    app.dependency_overrides[get_db_session] = _override_session
    app.dependency_overrides[get_current_active_user] = _override_user
    try:
        response = await test_client.post(
            "/api/v1/workspaces/2/members",
            json={"email": "member@example.com", "role": "member"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 409
    assert response.json()["detail"] == "Пользователь уже состоит в команде"


@pytest.mark.asyncio
async def test_workspace_member_summary_returns_member_totals(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_member_summary(_session, user, workspace_id):
        assert user.id == 1
        assert workspace_id == 2
        member = _member(
            workspace_id=2,
            tasks_count=3,
            completed_tasks_count=1,
            total_time_seconds=420,
        )
        return WorkspaceMemberSummaryResponse(
            items=[
                WorkspaceMemberSummaryItem(
                    user=member.user,
                    role=member.role,
                    tasks_count=member.tasks_count,
                    completed_tasks_count=member.completed_tasks_count,
                    projects_count=member.projects_count,
                    total_time_seconds=member.total_time_seconds,
                )
            ]
        )

    monkeypatch.setattr("src.api.v1.workspaces.build_workspace_member_summary", fake_member_summary)
    app.dependency_overrides[get_db_session] = _override_session
    app.dependency_overrides[get_current_active_user] = _override_user
    try:
        response = await test_client.get("/api/v1/workspaces/2/members/summary")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["items"][0]["tasks_count"] == 3
    assert data["items"][0]["total_time_seconds"] == 420


@pytest.mark.asyncio
async def test_delete_workspace_is_disabled(test_client) -> None:
    async def override_session():
        yield object()

    async def override_user():
        return SimpleNamespace(id=1)

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.delete("/api/v1/workspaces/2")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 405
