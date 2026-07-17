from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import Index
from starlette.requests import Request

from src.core.config import Settings
from src.models.enums import UserRole, WorkspaceInvitationStatus, WorkspaceRole
from src.models.invitation import WorkspaceInvitation
from src.models.registration import PendingRegistration
from src.models.user import User
from src.models.workspace import Workspace, WorkspaceMember
from src.schemas.auth import RegisterRequest, RegistrationVerifyRequest
from src.services.email_templates import (
    render_registration_verification_email,
    render_workspace_invitation_email,
)
from src.services.invitation import (
    accept_invitation,
    decline_invitation,
    generate_invitation_token,
    hash_invitation_token,
)
from src.services.rate_limit import get_request_client_ip
from src.services.registration import (
    generate_verification_code,
    hash_verification_code,
    resend_registration_code,
    start_registration,
    verify_registration,
)
from tests.conftest import DummyResult, DummySession


def _challenge(
    *,
    code: str = "012345",
    attempts: int = 0,
    resend_count: int = 0,
    expires_at: datetime | None = None,
    resend_available_at: datetime | None = None,
    consumed_at: datetime | None = None,
) -> PendingRegistration:
    challenge_id = uuid4()
    return PendingRegistration(
        id=challenge_id,
        email="new@example.com",
        username="new-user",
        password_hash="hashed-password",
        verification_code_hash=hash_verification_code(challenge_id, 1, code),
        locale="en",
        attempts=attempts,
        resend_count=resend_count,
        generation=1,
        expires_at=expires_at or datetime.now(UTC) + timedelta(minutes=10),
        resend_available_at=resend_available_at or datetime.now(UTC) - timedelta(seconds=1),
        consumed_at=consumed_at,
    )


def _invitation(
    *,
    email: str = "member@example.com",
    invitation_status: WorkspaceInvitationStatus = WorkspaceInvitationStatus.PENDING,
    expires_at: datetime | None = None,
) -> WorkspaceInvitation:
    return WorkspaceInvitation(
        id=uuid4(),
        workspace_id=7,
        invited_email=email,
        invited_by_user_id=1,
        role=WorkspaceRole.MEMBER,
        status=invitation_status,
        token_hash="a" * 64,
        email_generation=1,
        expires_at=expires_at or datetime.now(UTC) + timedelta(days=7),
    )


def _user(*, user_id: int = 2, email: str = "member@example.com") -> User:
    return User(
        id=user_id,
        email=email,
        username=f"user-{user_id}",
        hashed_password="hash",
        avatar_seed=f"seed-{user_id}",
        role=UserRole.USER,
        is_active=True,
        email_verified=True,
        locale="en",
    )


def test_verification_code_is_six_digits_and_preserves_leading_zero(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("src.services.registration.secrets.randbelow", lambda _limit: 123)

    code = generate_verification_code()

    assert code == "000123"
    assert RegistrationVerifyRequest(verification_id=uuid4(), code=code).code == "000123"


def test_verification_code_hash_is_keyed_and_not_plaintext() -> None:
    verification_id = uuid4()
    digest = hash_verification_code(verification_id, 1, "012345")

    assert digest != "012345"
    assert len(digest) == 64
    assert digest != hash_verification_code(verification_id, 2, "012345")
    assert digest != hash_verification_code(uuid4(), 1, "012345")


def test_invitation_token_is_random_and_only_hash_is_storage_safe() -> None:
    first = generate_invitation_token()
    second = generate_invitation_token()

    assert first != second
    assert len(first) >= 32
    assert first not in hash_invitation_token(first)
    assert hash_invitation_token(first) != hash_invitation_token(second)


def test_pending_registration_model_has_no_plaintext_password_or_code_columns() -> None:
    columns = set(PendingRegistration.__table__.columns.keys())

    assert "password_hash" in columns
    assert "verification_code_hash" in columns
    assert "password" not in columns
    assert "verification_code" not in columns
    assert "code" not in columns


def test_invitation_model_enforces_one_pending_email_per_workspace() -> None:
    indexes = {
        index.name: index
        for index in WorkspaceInvitation.__table__.indexes
        if isinstance(index, Index)
    }
    pending_index = indexes["uq_workspace_invitations_pending_email"]

    assert pending_index.unique is True
    assert [column.name for column in pending_index.columns] == ["workspace_id", "invited_email"]
    assert "pending" in str(pending_index.dialect_options["postgresql"]["where"])


def test_invitation_model_has_security_lifecycle_fields() -> None:
    columns = set(WorkspaceInvitation.__table__.columns.keys())

    assert {
        "token_hash",
        "expires_at",
        "accepted_at",
        "declined_at",
        "revoked_at",
        "email_generation",
    } <= columns
    assert "token" not in columns


@pytest.mark.parametrize("locale", ["ru", "en"])
def test_registration_email_template_is_localized_and_has_plaintext(locale: str) -> None:
    rendered = render_registration_verification_email(code="012345", locale=locale, ttl_minutes=10)

    assert "012345" in rendered.html
    assert "012345" in rendered.text
    assert "10" in rendered.text
    assert "password" not in rendered.text.lower()


@pytest.mark.parametrize("locale", ["ru", "en"])
def test_invitation_email_template_escapes_names_and_contains_cta(locale: str) -> None:
    rendered = render_workspace_invitation_email(
        locale=locale,
        inviter_name='<script>alert("inviter")</script>',
        workspace_name='<img src=x onerror=alert("workspace")>',
        expires_at=datetime.now(UTC) + timedelta(days=7),
        invitation_url="https://time-tracking.online/invitations/accept?token=secret-token",
        timezone_name="UTC",
    )

    assert "<script>" not in rendered.html
    assert "<img" not in rendered.html
    assert "secret-token" in rendered.text
    assert rendered.subject


def test_security_settings_have_expected_defaults() -> None:
    config = Settings(_env_file=None)

    assert config.email_verification_code_ttl_minutes == 10
    assert config.email_verification_resend_cooldown_seconds == 60
    assert config.email_verification_max_attempts == 5
    assert config.email_verification_max_resends == 5
    assert config.workspace_invitation_ttl_days == 7


def test_final_invitation_statuses_are_not_pending() -> None:
    assert {
        WorkspaceInvitationStatus.ACCEPTED,
        WorkspaceInvitationStatus.DECLINED,
        WorkspaceInvitationStatus.REVOKED,
        WorkspaceInvitationStatus.EXPIRED,
    }.isdisjoint({WorkspaceInvitationStatus.PENDING})


def test_owner_role_cannot_be_requested_by_invitation_schema() -> None:
    invitation = WorkspaceInvitation(
        id=uuid4(),
        workspace_id=1,
        invited_email="member@example.com",
        invited_by_user_id=1,
        role=WorkspaceRole.MEMBER,
        status=WorkspaceInvitationStatus.PENDING,
        token_hash="a" * 64,
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )

    assert invitation.role == WorkspaceRole.MEMBER


def test_invalid_verification_code_schema_is_rejected() -> None:
    with pytest.raises(ValidationError):
        RegistrationVerifyRequest(verification_id=uuid4(), code="12a456")


def test_expired_invitation_error_is_public_safe() -> None:
    error = HTTPException(status_code=410, detail="Приглашение истекло")

    assert "token" not in str(error.detail).lower()


@pytest.mark.asyncio
async def test_start_registration_stores_only_hashes_and_enqueues_email(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = DummySession()
    session.execute_results = [
        DummyResult(scalar_one_or_none=None),
        DummyResult(scalar_one_or_none=None),
    ]
    enqueued: list[tuple[object, int, str]] = []
    monkeypatch.setattr("src.services.registration.generate_verification_code", lambda: "012345")
    monkeypatch.setattr(
        "src.services.registration.enqueue_registration_verification_email",
        lambda verification_id, generation, code: enqueued.append(
            (verification_id, generation, code)
        ),
    )

    response = await start_registration(
        session,
        RegisterRequest(
            email=" New.User@Example.com ",
            username="new-user",
            password="a-secure-password",
        ),
        locale="en-US",
    )

    challenge = next(item for item in session.items if isinstance(item, PendingRegistration))
    assert challenge.email == "new.user@example.com"
    assert challenge.password_hash != "a-secure-password"
    assert challenge.verification_code_hash != "012345"
    assert challenge.locale == "en"
    assert response.email_masked.endswith("@example.com")
    assert enqueued == [(challenge.id, challenge.generation, "012345")]


@pytest.mark.asyncio
async def test_wrong_verification_code_increments_attempts() -> None:
    challenge_id = uuid4()
    challenge = PendingRegistration(
        id=challenge_id,
        email="new@example.com",
        username="new-user",
        password_hash="hash",
        verification_code_hash=hash_verification_code(challenge_id, 1, "012345"),
        locale="ru",
        attempts=0,
        resend_count=0,
        generation=1,
        expires_at=datetime.now(UTC) + timedelta(minutes=10),
        resend_available_at=datetime.now(UTC),
    )
    session = DummySession()
    session.execute_results = [DummyResult(scalar_one_or_none=challenge)]

    with pytest.raises(HTTPException) as exc_info:
        await verify_registration(session, verification_id=challenge_id, code="999999")

    assert exc_info.value.status_code == 400
    assert challenge.attempts == 1
    assert session.committed is True


@pytest.mark.asyncio
async def test_resend_invalidates_old_code_and_increments_generation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    challenge_id = uuid4()
    old_hash = hash_verification_code(challenge_id, 1, "111111")
    challenge = PendingRegistration(
        id=challenge_id,
        email="new@example.com",
        username="new-user",
        password_hash="hash",
        verification_code_hash=old_hash,
        locale="ru",
        attempts=3,
        resend_count=0,
        generation=1,
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
        resend_available_at=datetime.now(UTC) - timedelta(seconds=1),
    )
    session = DummySession()
    session.execute_results = [DummyResult(scalar_one_or_none=challenge)]
    enqueued: list[tuple[object, int, str]] = []
    monkeypatch.setattr("src.services.registration.generate_verification_code", lambda: "000001")
    monkeypatch.setattr(
        "src.services.registration.enqueue_registration_verification_email",
        lambda verification_id, generation, code: enqueued.append(
            (verification_id, generation, code)
        ),
    )

    await resend_registration_code(session, verification_id=challenge_id)

    assert challenge.generation == 2
    assert challenge.attempts == 0
    assert challenge.verification_code_hash != old_hash
    assert challenge.verification_code_hash == hash_verification_code(challenge_id, 2, "000001")
    assert enqueued == [(challenge_id, 2, "000001")]


def test_client_ip_uses_proxy_header_only_when_explicitly_trusted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = Request(
        {
            "type": "http",
            "headers": [(b"x-real-ip", b"203.0.113.10")],
            "client": ("172.18.0.5", 12345),
        }
    )
    monkeypatch.setattr("src.services.rate_limit.settings.trusted_proxy_headers", False)
    assert get_request_client_ip(request) == "172.18.0.5"

    monkeypatch.setattr("src.services.rate_limit.settings.trusted_proxy_headers", True)
    assert get_request_client_ip(request) == "203.0.113.10"


@pytest.mark.asyncio
async def test_existing_user_registration_returns_decoy_without_creating_challenge(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = DummySession()
    session.execute_results = [DummyResult(scalar_one_or_none=1)]
    enqueued: list[object] = []
    monkeypatch.setattr(
        "src.services.registration.enqueue_registration_verification_email",
        lambda *_args: enqueued.append(object()),
    )

    response = await start_registration(
        session,
        RegisterRequest(
            email="existing@example.com",
            username="existing",
            password="a-secure-password",
        ),
        locale="ru",
    )

    assert response.email_masked.endswith("@example.com")
    assert session.items == []
    assert enqueued == []


@pytest.mark.asyncio
async def test_successful_verification_creates_user_only_after_code_is_valid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    challenge = _challenge(code="000123")

    class VerificationSession(DummySession):
        async def flush(self) -> None:
            for item in self.items:
                if isinstance(item, User) and item.id is None:
                    item.id = 22
                if isinstance(item, Workspace) and item.id is None:
                    item.id = 33

        async def refresh(self, item: object) -> None:
            if isinstance(item, User):
                item.created_at = datetime.now(UTC)

    session = VerificationSession()
    session.execute_results = [
        DummyResult(scalar_one_or_none=challenge),
        DummyResult(scalar_one_or_none=None),
        DummyResult(),
    ]
    notifications: list[int] = []

    async def fake_pending_notifications(_session: object, user: User) -> None:
        notifications.append(user.id)

    monkeypatch.setattr(
        "src.services.invitation.create_pending_invitation_notifications",
        fake_pending_notifications,
    )

    assert not any(isinstance(item, User) for item in session.items)
    response = await verify_registration(
        session,
        verification_id=challenge.id,
        code="000123",
    )

    user = next(item for item in session.items if isinstance(item, User))
    membership = next(item for item in session.items if isinstance(item, WorkspaceMember))
    assert user.email_verified is True
    assert membership.user_id == user.id
    assert membership.workspace_id == 33
    assert challenge.consumed_at is not None
    assert response.user.id == user.id
    assert response.access_token
    assert notifications == [user.id]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("challenge", "expected_status"),
    [
        (_challenge(expires_at=datetime.now(UTC) - timedelta(seconds=1)), 410),
        (_challenge(attempts=5), 429),
        (_challenge(consumed_at=datetime.now(UTC)), 409),
    ],
)
async def test_verification_rejects_expired_locked_and_consumed_challenges(
    challenge: PendingRegistration,
    expected_status: int,
) -> None:
    session = DummySession()
    session.execute_results = [DummyResult(scalar_one_or_none=challenge)]

    with pytest.raises(HTTPException) as exc_info:
        await verify_registration(session, verification_id=challenge.id, code="012345")

    assert exc_info.value.status_code == expected_status
    assert not any(isinstance(item, User) for item in session.items)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "challenge",
    [
        _challenge(resend_available_at=datetime.now(UTC) + timedelta(seconds=30)),
        _challenge(resend_count=5),
    ],
)
async def test_resend_enforces_cooldown_and_total_limit(challenge: PendingRegistration) -> None:
    session = DummySession()
    session.execute_results = [DummyResult(scalar_one_or_none=challenge)]

    with pytest.raises(HTTPException) as exc_info:
        await resend_registration_code(session, verification_id=challenge.id)

    assert exc_info.value.status_code == 429


@pytest.mark.asyncio
async def test_accept_invitation_creates_exactly_one_membership(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    invitation = _invitation()
    user = _user()
    session = DummySession()
    session.execute_results = [
        DummyResult(scalar_one_or_none=invitation),
        DummyResult(scalar_one_or_none=None),
        DummyResult(scalar_one=[]),
    ]

    async def no_event(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr("src.services.invitation.publish_user_event", no_event)
    monkeypatch.setattr("src.services.invitation.publish_workspace_event", no_event)

    accepted = await accept_invitation(session, user, invitation.id)

    memberships = [item for item in session.items if isinstance(item, WorkspaceMember)]
    assert len(memberships) == 1
    assert memberships[0].workspace_id == invitation.workspace_id
    assert memberships[0].user_id == user.id
    assert accepted.status == WorkspaceInvitationStatus.ACCEPTED
    assert accepted.accepted_at is not None


@pytest.mark.asyncio
async def test_invitation_cannot_be_accepted_twice() -> None:
    invitation = _invitation(invitation_status=WorkspaceInvitationStatus.ACCEPTED)
    session = DummySession()
    session.execute_results = [DummyResult(scalar_one_or_none=invitation)]

    with pytest.raises(HTTPException) as exc_info:
        await accept_invitation(session, _user(), invitation.id)

    assert exc_info.value.status_code == 409
    assert not any(isinstance(item, WorkspaceMember) for item in session.items)


@pytest.mark.asyncio
async def test_wrong_account_cannot_decline_invitation() -> None:
    invitation = _invitation(email="intended@example.com")
    session = DummySession()
    session.execute_results = [DummyResult(scalar_one_or_none=invitation)]

    with pytest.raises(HTTPException) as exc_info:
        await decline_invitation(session, _user(email="other@example.com"), invitation.id)

    assert exc_info.value.status_code == 403
    assert invitation.status == WorkspaceInvitationStatus.PENDING


@pytest.mark.asyncio
async def test_expired_invitation_is_finalized_before_accept() -> None:
    invitation = _invitation(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    session = DummySession()
    session.execute_results = [
        DummyResult(scalar_one_or_none=invitation),
        DummyResult(scalar_one=[]),
    ]

    with pytest.raises(HTTPException) as exc_info:
        await accept_invitation(session, _user(), invitation.id)

    assert exc_info.value.status_code == 410
    assert invitation.status == WorkspaceInvitationStatus.EXPIRED
    assert session.committed is True
