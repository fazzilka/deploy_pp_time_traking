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
    WorkspaceMemberAdd,
    WorkspaceMemberRead,
    WorkspaceMemberSummaryItem,
    WorkspaceMemberSummaryResponse,
    WorkspaceMemberUpdate,
    WorkspaceMemberUser,
    WorkspaceRead,
    WorkspaceSummary,
)
from tests.conftest import DummyResult, DummySession

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
            avatar_seed=overrides.get("avatar_seed", "seed-member-2"),
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


def _workspace_summary(**overrides) -> WorkspaceSummary:
    workspace = _workspace(
        id=overrides.get("workspace_id", 2),
        type=WorkspaceType.TEAM,
        name=overrides.get("workspace_name", "Engineering"),
        members_count=overrides.get("members_count", 2),
        projects_count=overrides.get("projects_count", 3),
        tasks_count=overrides.get("tasks_count", 7),
    )
    return WorkspaceSummary(
        workspace=workspace,
        members_count=overrides.get("members_count", 2),
        active_members_count=overrides.get("active_members_count", 2),
        projects_count=overrides.get("projects_count", 3),
        active_projects_count=overrides.get("active_projects_count", 3),
        tasks_count=overrides.get("tasks_count", 7),
        active_tasks_count=overrides.get("active_tasks_count", 1),
        completed_tasks_count=overrides.get("completed_tasks_count", 4),
        total_time_seconds=overrides.get("total_time_seconds", 3600),
    )


class WorkspaceServiceSession(DummySession):
    async def refresh(self, item) -> None:
        item.id = getattr(item, "id", None) or 99
        item.joined_at = getattr(item, "joined_at", None) or NOW


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
async def test_list_workspaces_returns_team_workspace_for_added_member(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def override_added_user():
        return SimpleNamespace(id=2)

    async def fake_get_user_workspaces(_session, user):
        assert user.id == 2
        return [
            _workspace(id=1),
            _workspace(
                id=7,
                name="Engineering",
                type=WorkspaceType.TEAM,
                owner_id=1,
                current_user_role=WorkspaceRole.MEMBER,
            ),
        ]

    monkeypatch.setattr("src.api.v1.workspaces.get_user_workspaces", fake_get_user_workspaces)
    app.dependency_overrides[get_db_session] = _override_session
    app.dependency_overrides[get_current_active_user] = override_added_user
    try:
        response = await test_client.get("/api/v1/workspaces")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert [workspace["name"] for workspace in data] == ["Личное пространство", "Engineering"]
    assert data[1]["current_user_role"] == "member"


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
    assert data["user"]["avatar_seed"] == "seed-member-2"


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
async def test_add_workspace_member_service_persists_real_membership(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.models.user import User
    from src.models.workspace import WorkspaceMember
    from src.services.workspace import add_workspace_member_by_email

    session = WorkspaceServiceSession()
    target_user = User(
        id=42,
        email="member@example.com",
        username="member",
        full_name="Team Member",
        hashed_password="hashed",
        avatar_seed="seed-member-42",
        is_active=True,
    )
    session.execute_results = [DummyResult(scalar_one_or_none=target_user)]

    async def fake_require_role(_session, _user_id, _workspace_id, _roles):
        return SimpleNamespace(role=WorkspaceRole.OWNER)

    async def fake_get_active_membership(_session, _user_id, _workspace_id):
        return None

    published_events = []

    async def fake_publish_user_event(user_id, event, data):
        published_events.append((user_id, event, data))

    monkeypatch.setattr("src.services.workspace.require_workspace_role", fake_require_role)
    monkeypatch.setattr("src.services.workspace.get_active_membership", fake_get_active_membership)
    monkeypatch.setattr("src.services.workspace.publish_user_event", fake_publish_user_event)

    member = await add_workspace_member_by_email(
        session,
        SimpleNamespace(id=1),
        7,
        WorkspaceMemberAdd(email="member@example.com", role=WorkspaceRole.MEMBER),
    )

    persisted_member = next(item for item in session.items if isinstance(item, WorkspaceMember))
    assert persisted_member.workspace_id == 7
    assert persisted_member.user_id == 42
    assert persisted_member.role == WorkspaceRole.MEMBER
    assert persisted_member.status == WorkspaceMemberStatus.ACTIVE
    assert session.committed is True
    assert member.workspace_id == 7
    assert member.user.email == "member@example.com"
    assert any(
        user_id == 42
        and event == "workspace.membership.changed"
        and data["reason"] == "added"
        and data["workspace_id"] == 7
        for user_id, event, data in published_events
    )


@pytest.mark.asyncio
async def test_add_workspace_member_service_rejects_owner_role(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.services.workspace import add_workspace_member_by_email

    async def fake_require_role(_session, _user_id, _workspace_id, _roles):
        return SimpleNamespace(role=WorkspaceRole.OWNER)

    monkeypatch.setattr("src.services.workspace.require_workspace_role", fake_require_role)

    with pytest.raises(HTTPException) as exc_info:
        await add_workspace_member_by_email(
            WorkspaceServiceSession(),
            SimpleNamespace(id=1),
            7,
            WorkspaceMemberAdd(email="member@example.com", role=WorkspaceRole.OWNER),
        )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_leave_workspace_removes_current_user_membership(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.models.workspace import Workspace, WorkspaceMember
    from src.services.workspace import leave_workspace

    session = WorkspaceServiceSession()
    workspace = Workspace(
        id=7,
        name="Engineering",
        type=WorkspaceType.TEAM,
        owner_id=1,
    )
    membership = WorkspaceMember(
        id=15,
        workspace_id=7,
        user_id=42,
        role=WorkspaceRole.MEMBER,
        status=WorkspaceMemberStatus.ACTIVE,
        workspace=workspace,
    )
    published_events = []

    async def fake_get_active_membership(_session, _user_id, _workspace_id):
        return membership

    async def fake_publish_user_event(user_id, event, data):
        published_events.append((user_id, event, data))

    monkeypatch.setattr("src.services.workspace.get_active_membership", fake_get_active_membership)
    monkeypatch.setattr("src.services.workspace.publish_user_event", fake_publish_user_event)

    await leave_workspace(session, SimpleNamespace(id=42), 7)

    assert session.deleted == [membership]
    assert session.committed is True
    assert published_events == [
        (
            42,
            "workspace.membership.changed",
            {
                "reason": "left",
                "workspace_id": 7,
                "workspace_name": "Engineering",
                "user_id": 42,
            },
        )
    ]


@pytest.mark.asyncio
async def test_leave_workspace_rejects_owner_without_transfer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.models.workspace import Workspace, WorkspaceMember
    from src.services.workspace import leave_workspace

    workspace = Workspace(id=7, name="Engineering", type=WorkspaceType.TEAM, owner_id=42)
    membership = WorkspaceMember(
        id=15,
        workspace_id=7,
        user_id=42,
        role=WorkspaceRole.OWNER,
        status=WorkspaceMemberStatus.ACTIVE,
        workspace=workspace,
    )

    async def fake_get_active_membership(_session, _user_id, _workspace_id):
        return membership

    monkeypatch.setattr("src.services.workspace.get_active_membership", fake_get_active_membership)

    with pytest.raises(HTTPException) as exc_info:
        await leave_workspace(WorkspaceServiceSession(), SimpleNamespace(id=42), 7)

    assert exc_info.value.status_code == 400
    assert (
        exc_info.value.detail
        == "Перед выходом из организации передайте роль владельца другому участнику."
    )


@pytest.mark.asyncio
async def test_leave_workspace_rejects_personal_workspace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.models.workspace import Workspace, WorkspaceMember
    from src.services.workspace import leave_workspace

    workspace = Workspace(
        id=1, name="Личное пространство", type=WorkspaceType.PERSONAL, owner_id=42
    )
    membership = WorkspaceMember(
        id=1,
        workspace_id=1,
        user_id=42,
        role=WorkspaceRole.OWNER,
        status=WorkspaceMemberStatus.ACTIVE,
        workspace=workspace,
    )

    async def fake_get_active_membership(_session, _user_id, _workspace_id):
        return membership

    monkeypatch.setattr("src.services.workspace.get_active_membership", fake_get_active_membership)

    with pytest.raises(HTTPException) as exc_info:
        await leave_workspace(WorkspaceServiceSession(), SimpleNamespace(id=42), 1)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Нельзя выйти из личного workspace"


@pytest.mark.asyncio
async def test_update_workspace_member_sends_role_changed_notification_and_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.models.user import User
    from src.models.workspace import Workspace, WorkspaceMember
    from src.services.workspace import update_workspace_member

    session = WorkspaceServiceSession()
    workspace = Workspace(id=7, name="Engineering", type=WorkspaceType.TEAM, owner_id=1)
    target_user = User(
        id=42,
        email="member@example.com",
        username="member",
        full_name="Team Member",
        hashed_password="hashed",
        avatar_seed="seed-member-42",
        is_active=True,
    )
    member = WorkspaceMember(
        id=15,
        workspace_id=7,
        user_id=42,
        role=WorkspaceRole.MEMBER,
        status=WorkspaceMemberStatus.ACTIVE,
        workspace=workspace,
        user=target_user,
    )
    notifications = []
    published_events = []

    async def fake_require_role(_session, _user_id, _workspace_id, _roles):
        return SimpleNamespace(role=WorkspaceRole.OWNER)

    async def fake_load_member_or_404(_session, _workspace_id, _member_id):
        return member

    async def fake_member_read(_session, updated_member):
        return _member(id=updated_member.id, workspace_id=7, role=updated_member.role)

    async def fake_create_notification(_session, **kwargs):
        notifications.append(kwargs)

    async def fake_publish_user_event(user_id, event, data):
        published_events.append((user_id, event, data))

    monkeypatch.setattr("src.services.workspace.require_workspace_role", fake_require_role)
    monkeypatch.setattr("src.services.workspace._load_member_or_404", fake_load_member_or_404)
    monkeypatch.setattr("src.services.workspace._member_read", fake_member_read)
    monkeypatch.setattr("src.services.workspace.create_notification", fake_create_notification)
    monkeypatch.setattr("src.services.workspace.publish_user_event", fake_publish_user_event)

    updated = await update_workspace_member(
        session,
        SimpleNamespace(id=1),
        7,
        15,
        WorkspaceMemberUpdate(role=WorkspaceRole.VIEWER),
    )

    assert updated.role == WorkspaceRole.VIEWER
    assert notifications[0]["type"].value == "workspace_member_role_changed"
    assert notifications[0]["payload"]["role"] == "viewer"
    assert published_events[-1] == (
        42,
        "workspace.membership.changed",
        {
            "reason": "role_changed",
            "workspace_id": 7,
            "workspace_name": "Engineering",
            "user_id": 42,
            "role": "viewer",
        },
    )


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
                    status=member.status,
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
    assert data["items"][0]["user"]["avatar_seed"] == "seed-member-2"
    assert data["items"][0]["total_time_seconds"] == 420


@pytest.mark.asyncio
async def test_workspace_summary_returns_active_and_completed_counts(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_workspace_summary(_session, user, workspace_id):
        assert user.id == 1
        assert workspace_id == 2
        return _workspace_summary()

    monkeypatch.setattr("src.api.v1.workspaces.build_workspace_summary", fake_workspace_summary)
    app.dependency_overrides[get_db_session] = _override_session
    app.dependency_overrides[get_current_active_user] = _override_user
    try:
        response = await test_client.get("/api/v1/workspaces/2/summary")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["active_members_count"] == 2
    assert data["active_tasks_count"] == 1
    assert data["completed_tasks_count"] == 4


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
