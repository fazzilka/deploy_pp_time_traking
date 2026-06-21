from __future__ import annotations

from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.api.deps import get_current_active_user, get_current_admin_user
from src.db.session import get_db_session
from src.main import app
from src.models.enums import UserRole
from src.models.user import User
from src.schemas.auth import LoginRequest, RegisterRequest
from src.schemas.user import (
    ActivityResponse,
    ActivitySummary,
    AdminSystemStats,
    AdminUserListResponse,
    TopUserStats,
    UserPublic,
)
from src.services import admin as admin_service
from src.services import auth as auth_service
from src.services import user as user_service
from src.services.auth import login_user, register_user
from src.services.user import count_current_streak, count_max_streak, get_activity_level
from tests.conftest import DummyResult, DummySession


def make_user(
    *,
    user_id: int = 1,
    email: str = "user@example.com",
    username: str = "user",
    full_name: str | None = "Дмитрий",
    role: UserRole = UserRole.USER,
    is_active: bool = True,
    hashed_password: str | None = None,
    avatar_seed: str = "seed-user-1",
) -> User:
    user = User(
        email=email,
        username=username,
        full_name=full_name,
        hashed_password=hashed_password or auth_service.get_password_hash("password123"),
        avatar_seed=avatar_seed,
        role=role,
        is_active=is_active,
    )
    user.id = user_id
    user.created_at = datetime(2026, 5, 18, tzinfo=UTC)
    user.updated_at = datetime(2026, 5, 18, tzinfo=UTC)
    return user


@pytest.mark.asyncio
async def test_register_user_creates_regular_user() -> None:
    session = DummySession()
    session.execute_results = [DummyResult(scalar_one=[])]

    user = await register_user(
        session,
        RegisterRequest(
            email="USER@example.com",
            username="user",
            password="password1234",
            full_name="Дмитрий",
        ),
    )

    assert user.email == "user@example.com"
    assert user.role == UserRole.USER
    assert user.hashed_password != "password1234"
    assert user.avatar_seed
    assert session.committed is True
    assert session.execute_count == 1


def test_register_schema_rejects_admin_role() -> None:
    with pytest.raises(ValidationError):
        RegisterRequest.model_validate(
            {
                "email": "user@example.com",
                "username": "user",
                "password": "password1234",
                "role": "admin",
            }
        )


@pytest.mark.asyncio
async def test_register_duplicate_email_returns_409() -> None:
    session = DummySession()
    session.execute_results = [DummyResult(scalar_one=[make_user()])]

    with pytest.raises(HTTPException) as exc:
        await register_user(
            session,
            RegisterRequest(email="user@example.com", username="other", password="password1234"),
        )

    assert exc.value.status_code == 409
    assert exc.value.detail == auth_service.REGISTRATION_CONFLICT_DETAIL
    assert session.execute_count == 1


@pytest.mark.asyncio
async def test_register_duplicate_username_returns_409() -> None:
    session = DummySession()
    session.execute_results = [DummyResult(scalar_one=[make_user()])]

    with pytest.raises(HTTPException) as exc:
        await register_user(
            session,
            RegisterRequest(email="other@example.com", username="user", password="password1234"),
        )

    assert exc.value.status_code == 409
    assert exc.value.detail == auth_service.REGISTRATION_CONFLICT_DETAIL
    assert session.execute_count == 1


@pytest.mark.asyncio
async def test_register_duplicate_email_and_username_share_public_message() -> None:
    email_session = DummySession()
    username_session = DummySession()
    email_session.execute_results = [DummyResult(scalar_one=[make_user()])]
    username_session.execute_results = [DummyResult(scalar_one=[make_user()])]

    with pytest.raises(HTTPException) as email_exc:
        await register_user(
            email_session,
            RegisterRequest(email="user@example.com", username="other", password="password1234"),
        )
    with pytest.raises(HTTPException) as username_exc:
        await register_user(
            username_session,
            RegisterRequest(email="other@example.com", username="user", password="password1234"),
        )

    assert email_exc.value.status_code == username_exc.value.status_code == 409
    assert email_exc.value.detail == username_exc.value.detail


def test_register_schema_requires_12_character_password() -> None:
    with pytest.raises(ValidationError):
        RegisterRequest(email="user@example.com", username="user", password="12345678901")

    request = RegisterRequest(
        email="user@example.com",
        username="user",
        password="123456789012",
    )

    assert request.password == "123456789012"


@pytest.mark.asyncio
async def test_login_user_returns_bearer_token() -> None:
    session = DummySession()
    user = make_user()
    session.execute_results = [DummyResult(scalar_one_or_none=user)]

    response = await login_user(
        session,
        LoginRequest(email="user@example.com", password="password123"),
    )

    assert response.token_type == "bearer"
    assert response.access_token
    assert response.user.id == user.id
    assert "stats" not in response.user.model_dump()
    assert session.execute_count == 1


@pytest.mark.asyncio
async def test_login_user_wrong_password_returns_401() -> None:
    session = DummySession()
    session.execute_results = [DummyResult(scalar_one_or_none=make_user())]

    with pytest.raises(HTTPException) as exc:
        await login_user(session, LoginRequest(email="user@example.com", password="wrong123"))

    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_login_user_missing_user_returns_401() -> None:
    session = DummySession()
    session.execute_results = [DummyResult(scalar_one_or_none=None)]

    with pytest.raises(HTTPException) as exc:
        await login_user(session, LoginRequest(email="missing@example.com", password="password123"))

    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_login_inactive_user_returns_403() -> None:
    session = DummySession()
    session.execute_results = [DummyResult(scalar_one_or_none=make_user(is_active=False))]

    with pytest.raises(HTTPException) as exc:
        await login_user(session, LoginRequest(email="user@example.com", password="password123"))

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_change_password_updates_hash_and_allows_login_with_new_password() -> None:
    session = DummySession()
    user = make_user(hashed_password=auth_service.get_password_hash("oldpass123"))

    await user_service.change_password(
        session,
        user,
        old_password="oldpass123",
        new_password="newpass456",
    )

    assert session.committed is True
    assert auth_service.verify_password("newpass456", user.hashed_password)
    assert not auth_service.verify_password("oldpass123", user.hashed_password)

    old_login_session = DummySession()
    old_login_session.execute_results = [DummyResult(scalar_one_or_none=user)]
    with pytest.raises(HTTPException) as exc:
        await login_user(
            old_login_session,
            LoginRequest(email="user@example.com", password="oldpass123"),
        )

    assert exc.value.status_code == 401

    new_login_session = DummySession()
    new_login_session.execute_results = [DummyResult(scalar_one_or_none=user)]
    response = await login_user(
        new_login_session,
        LoginRequest(email="user@example.com", password="newpass456"),
    )

    assert response.access_token
    assert response.user.id == user.id


@pytest.mark.asyncio
async def test_change_password_wrong_old_password_returns_400() -> None:
    session = DummySession()
    user = make_user(hashed_password=auth_service.get_password_hash("oldpass123"))

    with pytest.raises(HTTPException) as exc:
        await user_service.change_password(
            session,
            user,
            old_password="wrongpass",
            new_password="newpass456",
        )

    assert exc.value.status_code == 400
    assert auth_service.verify_password("oldpass123", user.hashed_password)
    assert session.committed is False


@pytest.mark.asyncio
async def test_change_password_same_password_returns_400() -> None:
    session = DummySession()
    user = make_user(hashed_password=auth_service.get_password_hash("oldpass123"))

    with pytest.raises(HTTPException) as exc:
        await user_service.change_password(
            session,
            user,
            old_password="oldpass123",
            new_password="oldpass123",
        )

    assert exc.value.status_code == 400
    assert auth_service.verify_password("oldpass123", user.hashed_password)
    assert session.committed is False


@pytest.mark.asyncio
async def test_change_password_endpoint_requires_token(test_client) -> None:
    response = await test_client.post(
        "/api/v1/users/me/change-password",
        json={
            "old_password": "oldpass123",
            "new_password": "newpass456789",
            "confirm_password": "newpass456789",
        },
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_change_password_endpoint_success_hides_password_fields(
    test_client,
    dummy_session,
) -> None:
    user = make_user(hashed_password=auth_service.get_password_hash("oldpass123"))

    async def override_session():
        yield dummy_session

    async def override_user():
        return user

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.post(
            "/api/v1/users/me/change-password",
            json={
                "old_password": "oldpass123",
                "new_password": "newpass456789",
                "confirm_password": "newpass456789",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"message": "Пароль успешно изменён"}
    response_text = response.text
    assert "hashed_password" not in response_text
    assert "oldpass123" not in response_text
    assert "newpass456789" not in response_text
    assert auth_service.verify_password("newpass456789", user.hashed_password)


@pytest.mark.asyncio
async def test_change_password_endpoint_wrong_old_password_returns_400(
    test_client,
    dummy_session,
) -> None:
    user = make_user(hashed_password=auth_service.get_password_hash("oldpass123"))

    async def override_session():
        yield dummy_session

    async def override_user():
        return user

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.post(
            "/api/v1/users/me/change-password",
            json={
                "old_password": "wrongpass",
                "new_password": "newpass456789",
                "confirm_password": "newpass456789",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json()["detail"] == "Старый пароль указан неверно"
    assert auth_service.verify_password("oldpass123", user.hashed_password)


@pytest.mark.asyncio
async def test_change_password_endpoint_rejects_short_new_password(
    test_client,
    dummy_session,
) -> None:
    async def override_session():
        yield dummy_session

    async def override_user():
        return make_user()

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.post(
            "/api/v1/users/me/change-password",
            json={
                "old_password": "oldpass123",
                "new_password": "short",
                "confirm_password": "short",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_change_password_endpoint_rejects_mismatched_confirmation(
    test_client,
    dummy_session,
) -> None:
    async def override_session():
        yield dummy_session

    async def override_user():
        return make_user()

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.post(
            "/api/v1/users/me/change-password",
            json={
                "old_password": "oldpass123",
                "new_password": "newpass456789",
                "confirm_password": "another456789",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


def test_change_password_schema_requires_12_character_new_password() -> None:
    from src.schemas.user import ChangePasswordRequest

    with pytest.raises(ValidationError):
        ChangePasswordRequest(
            old_password="oldpass123",
            new_password="12345678901",
            confirm_password="12345678901",
        )

    request = ChangePasswordRequest(
        old_password="oldpass123",
        new_password="123456789012",
        confirm_password="123456789012",
    )

    assert request.new_password == "123456789012"


def test_user_public_contains_avatar_letter() -> None:
    user = UserPublic.model_validate(make_user(full_name="Дмитрий"))

    assert user.avatar_letter == "Д"
    assert user.avatar_seed == "seed-user-1"


def test_user_public_avatar_letter_falls_back_to_username() -> None:
    user = UserPublic.model_validate(make_user(full_name=None, username="dmitry"))

    assert user.avatar_letter == "D"


def test_activity_level_thresholds() -> None:
    assert get_activity_level(0) == 0
    assert get_activity_level(1) == 1
    assert get_activity_level(1800) == 2
    assert get_activity_level(3600) == 3
    assert get_activity_level(7200) == 4


def test_streak_calculation() -> None:
    active_dates = {
        date(2026, 1, 1),
        date(2026, 1, 2),
        date(2026, 1, 4),
        date(2026, 1, 5),
        date(2026, 1, 6),
    }

    assert count_current_streak(active_dates, date(2026, 1, 6)) == 3
    assert count_max_streak(active_dates) == 3


@pytest.mark.asyncio
async def test_activity_includes_empty_days_and_closed_intervals(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = DummySession()
    session.execute_results = [
        DummyResult(
            scalar_one=[
                (
                    date(2026, 1, 2),
                    1,
                    3600,
                ),
            ]
        )
    ]
    monkeypatch.setattr(
        user_service,
        "datetime",
        SimpleNamespace(
            now=lambda _tz: datetime(2026, 1, 3, tzinfo=UTC),
            combine=datetime.combine,
        ),
    )

    activity = await user_service.get_activity(session, user_id=1, year=2026)

    assert len(activity.days) == 365
    assert activity.days[0].date == date(2026, 1, 1)
    assert activity.days[0].level == 0
    day_with_time = next(day for day in activity.days if day.date == date(2026, 1, 2))
    assert day_with_time.total_time_seconds == 3600
    assert day_with_time.intervals_count == 1
    assert session.execute_count == 1


@pytest.mark.asyncio
async def test_profile_stats_uses_single_task_aggregate_query(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = DummySession()
    session.execute_results = [
        DummyResult(scalar_one=(5, 3, 7200)),
        DummyResult(scalar_one=[]),
    ]
    monkeypatch.setattr(
        user_service,
        "datetime",
        SimpleNamespace(
            now=lambda _tz: datetime(2026, 1, 3, tzinfo=UTC),
            combine=datetime.combine,
        ),
    )

    stats = await user_service.get_profile_stats(session, user_id=1)

    assert stats.tasks_count == 5
    assert stats.tasks_with_time_count == 3
    assert stats.total_time_seconds == 7200
    assert session.execute_count == 2


@pytest.mark.asyncio
async def test_users_me_requires_token(test_client) -> None:
    response = await test_client.get("/api/v1/users/me")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_users_me_rejects_invalid_token(test_client) -> None:
    response = await test_client.get(
        "/api/v1/users/me",
        headers={"Authorization": "Bearer invalid"},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_users_me_returns_lightweight_profile(test_client) -> None:
    async def override_user():
        return make_user()

    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.get("/api/v1/users/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == 1
    assert payload["email"] == "user@example.com"
    assert payload["avatar_seed"] == "seed-user-1"
    assert payload["created_at"] == "2026-05-18T00:00:00Z"
    assert "stats" not in payload
    assert response.headers["cache-control"] == "private, max-age=60"


@pytest.mark.asyncio
async def test_regenerate_avatar_seed_updates_profile(
    test_client,
    dummy_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current_user = make_user(avatar_seed="old-seed")

    async def override_session():
        yield dummy_session

    async def override_user():
        return current_user

    monkeypatch.setattr(user_service, "generate_avatar_seed", lambda: "new-seed")
    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.post("/api/v1/users/me/avatar/regenerate")
        profile_response = await test_client.get("/api/v1/users/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["avatar_seed"] == "new-seed"
    assert profile_response.status_code == 200
    assert profile_response.json()["avatar_seed"] == "new-seed"
    assert current_user.avatar_seed == "new-seed"
    assert dummy_session.committed is True


@pytest.mark.asyncio
async def test_users_me_stats_returns_profile_stats(
    test_client,
    dummy_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dummy_session.execute_results = [
        DummyResult(scalar_one=(5, 3, 7200)),
        DummyResult(scalar_one=[]),
    ]

    async def override_session():
        yield dummy_session

    async def override_user():
        return make_user()

    monkeypatch.setattr(
        user_service,
        "datetime",
        SimpleNamespace(
            now=lambda _tz: datetime(2026, 1, 3, tzinfo=UTC),
            combine=datetime.combine,
        ),
    )
    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.get("/api/v1/users/me/stats")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "tasks_count": 5,
        "tasks_with_time_count": 3,
        "total_time_seconds": 7200,
        "current_streak_days": 0,
        "max_streak_days": 0,
    }
    assert response.headers["cache-control"] == "private, max-age=15"
    assert dummy_session.execute_count == 2


@pytest.mark.asyncio
async def test_regular_user_cannot_open_admin_routes(test_client) -> None:
    async def override_user():
        return make_user(role=UserRole.USER)

    app.dependency_overrides[get_current_active_user] = override_user
    try:
        response = await test_client.get("/api/v1/admin/users")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_list_users_builds_stats_without_per_user_queries() -> None:
    session = DummySession()
    user = make_user(role=UserRole.ADMIN)
    session.execute_results = [
        DummyResult(scalar_one=1),
        DummyResult(scalar_one=[(user, 3, 7200)]),
    ]

    response = await admin_service.list_users(session, limit=50, offset=0)

    assert response.total == 1
    assert len(response.items) == 1
    assert response.items[0].stats.tasks_count == 3
    assert response.items[0].stats.total_time_seconds == 7200
    assert session.execute_results == []


@pytest.mark.asyncio
async def test_admin_can_open_users_list(test_client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def override_admin():
        return make_user(role=UserRole.ADMIN)

    async def override_session():
        yield object()

    async def fake_list_users(*_args, **_kwargs):
        return AdminUserListResponse(items=[], total=0)

    monkeypatch.setattr("src.api.v1.admin.list_users", fake_list_users)
    app.dependency_overrides[get_current_admin_user] = override_admin
    app.dependency_overrides[get_db_session] = override_session
    try:
        response = await test_client.get("/api/v1/admin/users")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0}


@pytest.mark.asyncio
async def test_admin_can_get_user_activity(test_client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def override_admin():
        return make_user(role=UserRole.ADMIN)

    async def override_session():
        yield object()

    async def fake_activity(*_args, **_kwargs):
        return ActivityResponse(
            year=2026,
            days=[],
            summary=ActivitySummary(
                active_days_count=0,
                current_streak_days=0,
                max_streak_days=0,
                total_intervals_count=0,
                total_time_seconds=0,
            ),
        )

    monkeypatch.setattr("src.api.v1.admin.get_user_activity_for_admin", fake_activity)
    app.dependency_overrides[get_current_admin_user] = override_admin
    app.dependency_overrides[get_db_session] = override_session
    try:
        response = await test_client.get("/api/v1/admin/users/1/activity?year=2026")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["year"] == 2026


@pytest.mark.asyncio
async def test_admin_can_get_system_stats(test_client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def override_admin():
        return make_user(role=UserRole.ADMIN)

    async def override_session():
        yield object()

    async def fake_stats(_session):
        return AdminSystemStats(
            users_count=1,
            active_users_count=1,
            admins_count=1,
            tasks_count=0,
            total_time_seconds=0,
            top_users=[
                TopUserStats(
                    id=1,
                    username="admin",
                    full_name=None,
                    avatar_letter="A",
                    total_time_seconds=0,
                )
            ],
        )

    monkeypatch.setattr("src.api.v1.admin.get_system_stats", fake_stats)
    app.dependency_overrides[get_current_admin_user] = override_admin
    app.dependency_overrides[get_db_session] = override_session
    try:
        response = await test_client.get("/api/v1/admin/stats")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["admins_count"] == 1
