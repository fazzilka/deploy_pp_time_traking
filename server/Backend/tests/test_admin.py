from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from src.api.deps import get_current_active_user, get_current_admin_user
from src.db.session import get_db_session
from src.main import app
from src.models.enums import UserRole
from src.models.user import User
from src.schemas.user import (
    AdminUserDetails,
    AdminUserListResponse,
    AdminUserUpdate,
    ProfileStats,
)
from src.services import admin as admin_service
from tests.conftest import DummyResult, DummySession


def make_user(
    user_id: int,
    *,
    role: UserRole = UserRole.USER,
    is_active: bool = True,
    username: str | None = None,
) -> User:
    user = User(
        id=user_id,
        email=f"user{user_id}@example.com",
        username=username or f"user{user_id}",
        full_name=f"User {user_id}",
        hashed_password="hash",
        avatar_seed=f"seed-{user_id}",
        role=role,
        is_active=is_active,
        email_verified=True,
    )
    user.created_at = datetime(2026, 7, 1, tzinfo=UTC)
    return user


def details_for(user: User) -> AdminUserDetails:
    return AdminUserDetails(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        avatar_letter=user.username[0].upper(),
        avatar_seed=user.avatar_seed,
        created_at=user.created_at,
        email_verified=user.email_verified,
        stats=ProfileStats(
            tasks_count=0,
            tasks_with_time_count=0,
            total_time_seconds=0,
            current_streak_days=0,
            max_streak_days=0,
        ),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/admin/users",
        "/api/v1/admin/users/1",
        "/api/v1/admin/users/1/activity",
        "/api/v1/admin/stats",
    ],
)
async def test_regular_user_cannot_open_admin_read_endpoints(test_client, path: str) -> None:
    async def override_user() -> User:
        return make_user(2)

    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.get(path)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_list_forwards_search_filters_and_pagination(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor = make_user(1, role=UserRole.ADMIN)
    captured: dict[str, object] = {}

    async def override_admin() -> User:
        return actor

    async def override_session():
        yield object()

    async def fake_list_users(_session, **kwargs):
        captured.update(kwargs)
        return AdminUserListResponse(items=[], total=0)

    monkeypatch.setattr("src.api.v1.admin.list_users", fake_list_users)
    app.dependency_overrides[get_current_admin_user] = override_admin
    app.dependency_overrides[get_db_session] = override_session
    try:
        response = await test_client.get(
            "/api/v1/admin/users?search=alex&role=admin&is_active=false&limit=20&offset=40"
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured == {
        "search": "alex",
        "role": UserRole.ADMIN,
        "is_active": False,
        "limit": 20,
        "offset": 40,
    }


@pytest.mark.asyncio
async def test_update_endpoint_passes_actor_to_service(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor = make_user(1, role=UserRole.ADMIN)
    target = make_user(2)
    captured: dict[str, object] = {}

    async def override_admin() -> User:
        return actor

    async def override_session():
        yield object()

    async def fake_update(_session, user_id, payload, *, actor):
        captured.update(user_id=user_id, payload=payload, actor=actor)
        target.full_name = payload.full_name
        return details_for(target)

    monkeypatch.setattr("src.api.v1.admin.update_user_by_admin", fake_update)
    app.dependency_overrides[get_current_admin_user] = override_admin
    app.dependency_overrides[get_db_session] = override_session
    try:
        response = await test_client.patch(
            "/api/v1/admin/users/2",
            json={"full_name": "Updated User"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["full_name"] == "Updated User"
    assert captured["user_id"] == 2
    assert captured["actor"] is actor


@pytest.mark.asyncio
async def test_admin_can_get_user_details(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor = make_user(1, role=UserRole.ADMIN)
    target = make_user(2)

    async def override_admin() -> User:
        return actor

    async def override_session():
        yield object()

    async def fake_details(_session, user_id: int) -> AdminUserDetails:
        assert user_id == target.id
        return details_for(target)

    monkeypatch.setattr("src.api.v1.admin.get_admin_user_profile", fake_details)
    app.dependency_overrides[get_current_admin_user] = override_admin
    app.dependency_overrides[get_db_session] = override_session
    try:
        response = await test_client.get("/api/v1/admin/users/2")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["email_verified"] is True


@pytest.mark.asyncio
async def test_admin_cannot_block_self() -> None:
    actor = make_user(1, role=UserRole.ADMIN)
    session = DummySession()
    session.get_map[(User, actor.id)] = actor

    with pytest.raises(HTTPException) as exc_info:
        await admin_service.update_user_by_admin(
            session,
            actor.id,
            AdminUserUpdate(is_active=False),
            actor=actor,
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "self_block"
    assert session.committed is False


@pytest.mark.asyncio
async def test_last_active_admin_cannot_be_demoted() -> None:
    actor = make_user(1, role=UserRole.ADMIN)
    session = DummySession()
    session.get_map[(User, actor.id)] = actor
    session.execute_results = [DummyResult(scalar_one=[actor.id])]

    with pytest.raises(HTTPException) as exc_info:
        await admin_service.update_user_by_admin(
            session,
            actor.id,
            AdminUserUpdate(role=UserRole.USER),
            actor=actor,
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "last_active_admin"
    assert session.committed is False


@pytest.mark.asyncio
async def test_admin_can_demote_another_admin_when_one_remains(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor = make_user(1, role=UserRole.ADMIN)
    target = make_user(2, role=UserRole.ADMIN)
    session = DummySession()
    session.get_map[(User, target.id)] = target
    session.execute_results = [DummyResult(scalar_one=[actor.id, target.id])]

    async def fake_details(_session, user: User) -> AdminUserDetails:
        return details_for(user)

    monkeypatch.setattr(admin_service, "_get_admin_user_details", fake_details)

    updated = await admin_service.update_user_by_admin(
        session,
        target.id,
        AdminUserUpdate(role=UserRole.USER),
        actor=actor,
    )

    assert updated.role == UserRole.USER
    assert session.committed is True


@pytest.mark.asyncio
async def test_admin_updates_profile_role_and_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor = make_user(1, role=UserRole.ADMIN)
    target = make_user(2)
    session = DummySession()
    session.get_map[(User, target.id)] = target

    async def fake_lookup(_session, _username: str):
        return None

    async def fake_details(_session, user: User) -> AdminUserDetails:
        return details_for(user)

    monkeypatch.setattr(admin_service, "get_user_by_username", fake_lookup)
    monkeypatch.setattr(admin_service, "_get_admin_user_details", fake_details)

    updated = await admin_service.update_user_by_admin(
        session,
        target.id,
        AdminUserUpdate(
            username="updated",
            full_name="Updated User",
            role=UserRole.ADMIN,
            is_active=False,
        ),
        actor=actor,
    )

    assert updated.username == "updated"
    assert updated.full_name == "Updated User"
    assert updated.role == UserRole.ADMIN
    assert updated.is_active is False
    assert session.committed is True


@pytest.mark.asyncio
async def test_duplicate_username_returns_conflict(monkeypatch: pytest.MonkeyPatch) -> None:
    actor = make_user(1, role=UserRole.ADMIN)
    target = make_user(2)
    existing = make_user(3, username="taken")
    session = DummySession()
    session.get_map[(User, target.id)] = target

    async def fake_lookup(_session, _username: str) -> User:
        return existing

    monkeypatch.setattr(admin_service, "get_user_by_username", fake_lookup)

    with pytest.raises(HTTPException) as exc_info:
        await admin_service.update_user_by_admin(
            session,
            target.id,
            AdminUserUpdate(username="taken"),
            actor=actor,
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "duplicate_username"


@pytest.mark.asyncio
async def test_updating_missing_user_returns_404() -> None:
    actor = make_user(1, role=UserRole.ADMIN)

    with pytest.raises(HTTPException) as exc_info:
        await admin_service.update_user_by_admin(
            DummySession(),
            404,
            AdminUserUpdate(full_name="Missing"),
            actor=actor,
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail["code"] == "user_not_found"
