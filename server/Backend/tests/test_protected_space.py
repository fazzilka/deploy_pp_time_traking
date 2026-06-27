from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.core.security import get_password_hash
from src.models.enums import WorkspaceMemberStatus, WorkspaceRole, WorkspaceType
from src.models.protected_space import ProtectedSpaceSession, ProtectedSpaceSettings
from src.models.workspace import Workspace, WorkspaceMember
from src.schemas.protected_space import ProtectedSpaceCreate, ProtectedSpaceUnlock
from src.schemas.workspace import WorkspaceMemberAdd, WorkspaceMemberUpdate
from src.services.protected_context import reset_request_vault_token, set_request_vault_token
from src.services.protected_space import (
    VAULT_LOCKOUT_ATTEMPTS,
    _token_hash,
    lock_protected_space,
    require_protected_space_unlocked,
    unlock_protected_space,
)
from src.services.workspace import (
    add_workspace_member_by_email,
    leave_workspace,
    remove_workspace_member,
    update_workspace_member,
)
from tests.conftest import DummyResult, DummySession

NOW = datetime(2026, 6, 1, 10, 0, tzinfo=UTC)


class ProtectedSpaceSessionStub(DummySession):
    async def flush(self) -> None:
        for item in self.items:
            if getattr(item, "id", None) is None:
                item.id = len(self.items) + 1


def test_vault_password_requires_twelve_characters() -> None:
    with pytest.raises(ValidationError):
        ProtectedSpaceCreate(password="short-pass")

    payload = ProtectedSpaceCreate(password="twelve-chars")
    assert payload.password == "twelve-chars"


def test_vault_token_hash_does_not_store_raw_token() -> None:
    raw_token = "raw-vault-token"
    hashed = _token_hash(raw_token)

    assert hashed != raw_token
    assert len(hashed) == 64


@pytest.mark.asyncio
async def test_valid_unlock_returns_raw_token_once_and_resets_failed_attempts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = ProtectedSpaceSettings(
        id=1,
        user_id=7,
        workspace_id=11,
        password_hash=get_password_hash("valid-password"),
        failed_attempts=3,
        locked_until=NOW - timedelta(minutes=1),
    )
    session = ProtectedSpaceSessionStub()
    session.execute_results = [DummyResult(scalar_one_or_none=settings)]

    monkeypatch.setattr("src.services.protected_space._now", lambda: NOW)
    monkeypatch.setattr("src.services.protected_space.secrets.token_urlsafe", lambda _size: "token")
    monkeypatch.setattr("src.services.protected_space.publish_user_event", _noop_event)

    response = await unlock_protected_space(
        session,
        SimpleNamespace(id=7),
        ProtectedSpaceUnlock(password="valid-password"),
    )

    vault_session = next(item for item in session.items if isinstance(item, ProtectedSpaceSession))
    assert response.vault_token == "token"
    assert vault_session.session_token_hash == _token_hash("token")
    assert vault_session.session_token_hash != response.vault_token
    assert response.expires_at == NOW + timedelta(minutes=10)
    assert settings.failed_attempts == 0
    assert settings.locked_until is None
    assert session.committed is True


@pytest.mark.asyncio
async def test_failed_unlock_sets_lockout_after_five_attempts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = ProtectedSpaceSettings(
        id=1,
        user_id=7,
        workspace_id=11,
        password_hash=get_password_hash("valid-password"),
        failed_attempts=VAULT_LOCKOUT_ATTEMPTS - 1,
    )
    session = ProtectedSpaceSessionStub()
    session.execute_results = [DummyResult(scalar_one_or_none=settings)]

    monkeypatch.setattr("src.services.protected_space._now", lambda: NOW)

    with pytest.raises(HTTPException) as exc_info:
        await unlock_protected_space(
            session,
            SimpleNamespace(id=7),
            ProtectedSpaceUnlock(password="wrong-password"),
        )

    assert exc_info.value.status_code == 403
    assert settings.failed_attempts == VAULT_LOCKOUT_ATTEMPTS
    assert settings.locked_until == NOW + timedelta(minutes=15)
    assert session.committed is True


@pytest.mark.asyncio
async def test_unlock_during_lockout_does_not_verify_password(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = ProtectedSpaceSettings(
        id=1,
        user_id=7,
        workspace_id=11,
        password_hash=get_password_hash("valid-password"),
        failed_attempts=VAULT_LOCKOUT_ATTEMPTS,
        locked_until=NOW + timedelta(minutes=15),
    )
    session = ProtectedSpaceSessionStub()
    session.execute_results = [DummyResult(scalar_one_or_none=settings)]

    monkeypatch.setattr("src.services.protected_space._now", lambda: NOW)

    def fail_verify(*_args) -> bool:
        raise AssertionError("password must not be verified during lockout")

    monkeypatch.setattr("src.services.protected_space.verify_password", fail_verify)

    with pytest.raises(HTTPException) as exc_info:
        await unlock_protected_space(
            session,
            SimpleNamespace(id=7),
            ProtectedSpaceUnlock(password="valid-password"),
        )

    assert exc_info.value.status_code == 429


@pytest.mark.asyncio
async def test_require_protected_space_unlocked_accepts_active_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    vault_session = ProtectedSpaceSession(
        id=1,
        user_id=7,
        workspace_id=11,
        session_token_hash=_token_hash("token"),
        created_at=NOW,
        expires_at=NOW + timedelta(minutes=5),
        max_expires_at=NOW + timedelta(minutes=15),
        last_activity_at=NOW,
    )
    session = ProtectedSpaceSessionStub()
    session.execute_results = [DummyResult(scalar_one_or_none=vault_session)]
    context_token = set_request_vault_token("token")
    monkeypatch.setattr("src.services.protected_space._now", lambda: NOW)

    try:
        await require_protected_space_unlocked(session, user_id=7, workspace_id=11)
    finally:
        reset_request_vault_token(context_token)

    assert vault_session.last_activity_at == NOW
    assert vault_session.expires_at == NOW + timedelta(minutes=10)


@pytest.mark.asyncio
async def test_lock_revokes_active_vault_sessions(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = ProtectedSpaceSettings(id=1, user_id=7, workspace_id=11, password_hash="hash")
    session = ProtectedSpaceSessionStub()
    session.execute_results = [DummyResult(scalar_one_or_none=settings), DummyResult()]

    monkeypatch.setattr("src.services.protected_space.publish_user_event", _noop_event)
    monkeypatch.setattr("src.services.protected_space._now", lambda: NOW)

    await lock_protected_space(session, SimpleNamespace(id=7))

    assert session.execute_count == 2
    assert session.committed is True


@pytest.mark.asyncio
async def test_protected_workspace_rejects_team_membership_operations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace = Workspace(
        id=11,
        name="Защищённое пространство 🔒",
        type=WorkspaceType.PERSONAL,
        owner_id=7,
        is_protected=True,
    )
    owner_member = WorkspaceMember(
        id=1,
        workspace_id=11,
        user_id=7,
        role=WorkspaceRole.OWNER,
        status=WorkspaceMemberStatus.ACTIVE,
        workspace=workspace,
    )
    session = ProtectedSpaceSessionStub()

    async def fake_require_role(*_args, **_kwargs):
        return owner_member

    async def fake_load_member(*_args, **_kwargs):
        return owner_member

    monkeypatch.setattr("src.services.workspace.require_workspace_role", fake_require_role)
    monkeypatch.setattr("src.services.workspace._load_member_or_404", fake_load_member)
    monkeypatch.setattr("src.services.workspace.get_active_membership", fake_require_role)

    with pytest.raises(HTTPException) as add_exc:
        await add_workspace_member_by_email(
            session,
            SimpleNamespace(id=7),
            11,
            WorkspaceMemberAdd(email="member@example.com", role=WorkspaceRole.MEMBER),
        )
    with pytest.raises(HTTPException) as update_exc:
        await update_workspace_member(
            session,
            SimpleNamespace(id=7),
            11,
            1,
            WorkspaceMemberUpdate(role=WorkspaceRole.MEMBER),
        )
    with pytest.raises(HTTPException) as remove_exc:
        await remove_workspace_member(session, SimpleNamespace(id=7), 11, 1)
    with pytest.raises(HTTPException) as leave_exc:
        await leave_workspace(session, SimpleNamespace(id=7), 11)

    assert add_exc.value.status_code == 400
    assert update_exc.value.status_code == 400
    assert remove_exc.value.status_code == 400
    assert leave_exc.value.status_code == 400


async def _noop_event(*_args, **_kwargs) -> None:
    return None
