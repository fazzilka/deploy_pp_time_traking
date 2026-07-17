from __future__ import annotations

import base64
import json
from datetime import UTC, datetime
from typing import Any, cast

import httpx
import pytest
from svix.webhooks import Webhook

from src.api.webhooks import _apply_delivery_event, _persist_resend_event
from src.cli.diagnose_email_notification import diagnose
from src.core.config import Settings
from src.models.enums import (
    NotificationDeliveryChannel,
    NotificationDeliveryStatus,
    NotificationType,
)
from src.models.notification import Notification, NotificationDelivery
from src.models.task import Task
from src.models.user import User
from src.models.workspace import Workspace
from src.schemas.user import NotificationPreferencesUpdate
from src.services.email_delivery import (
    RetryableEmailDeliveryError,
    _email_skip_reason,
    _idempotency_key,
    deliver_email_notification_async,
)
from src.services.email_provider import (
    EmailMessage,
    EmailProviderError,
    EmailSendResult,
    FakeEmailProvider,
    ResendEmailProvider,
)
from src.services.email_templates import render_notification_email
from src.services.transactional_email import _deliver_transactional
from src.services.user import get_notification_preferences, update_notification_preferences


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "email_enabled": True,
        "email_provider": "resend",
        "resend_api_key": "test-key",
        "resend_from_email": "notifications@example.com",
        "resend_webhook_secret": "whsec_test",
        "email_base_url": "https://time-tracking.example",
        **overrides,
    }
    return Settings(_env_file=None, **values)


def _message() -> EmailMessage:
    return EmailMessage(
        recipient="owner@example.com",
        sender="Time Tracking <notifications@example.com>",
        subject="Deadline",
        html="<p>Deadline</p>",
        text="Deadline",
        idempotency_key="notification:42:email:v1",
        tags={"notification": "42"},
    )


def _notification(locale: str = "en", *, reminder_minutes: int = 60) -> Notification:
    user = User(
        id=7,
        email="owner@example.com",
        username="owner",
        hashed_password="hash",
        avatar_seed="seed",
        locale=locale,
        email_notifications_enabled=True,
        email_deadline_24h=True,
        email_deadline_1h=True,
        email_deadline_overdue=True,
        is_active=True,
    )
    return Notification(
        id=42,
        user_id=user.id,
        user=user,
        task_id=9,
        type=NotificationType.DEADLINE_SOON,
        title="Дедлайн",
        message="Сообщение",
        payload={
            "task_title": '<script>alert("x")</script>',
            "deadline": "2026-07-17T20:00:00Z",
            "remind_before_minutes": reminder_minutes,
        },
    )


def test_resend_provider_maps_request_and_idempotency_key() -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["request"] = request
        return httpx.Response(200, json={"id": "email-123"})

    provider = ResendEmailProvider(_settings())
    provider._client = httpx.Client(  # noqa: SLF001
        base_url="https://api.resend.com",
        transport=httpx.MockTransport(handler),
    )
    result = provider.send(_message())

    request = cast(httpx.Request, captured["request"])
    assert request.url.path == "/emails"
    assert request.headers["Idempotency-Key"] == "notification:42:email:v1"
    assert result.provider_message_id == "email-123"
    assert result.accepted is True


@pytest.mark.parametrize("status_code", [429, 500, 503])
def test_resend_provider_retries_temporary_errors(status_code: int) -> None:
    provider = ResendEmailProvider(_settings())
    provider._client = httpx.Client(  # noqa: SLF001
        base_url="https://api.resend.com",
        transport=httpx.MockTransport(lambda _request: httpx.Response(status_code)),
    )

    with pytest.raises(EmailProviderError) as exc_info:
        provider.send(_message())

    assert exc_info.value.retryable is True


@pytest.mark.parametrize("status_code", [400, 401, 403, 422])
def test_resend_provider_does_not_retry_permanent_errors(status_code: int) -> None:
    provider = ResendEmailProvider(_settings())
    provider._client = httpx.Client(  # noqa: SLF001
        base_url="https://api.resend.com",
        transport=httpx.MockTransport(lambda _request: httpx.Response(status_code)),
    )

    with pytest.raises(EmailProviderError) as exc_info:
        provider.send(_message())

    assert exc_info.value.retryable is False


def test_fake_provider_never_sends_external_email() -> None:
    provider = FakeEmailProvider()
    result = provider.send(_message())

    assert provider.messages == [_message()]
    assert result.provider_message_id == "fake-1"


@pytest.mark.asyncio
async def test_same_notification_is_sent_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    notification = _notification()
    delivery = NotificationDelivery(
        id=5,
        notification_id=notification.id,
        user_id=notification.user_id,
        channel=NotificationDeliveryChannel.EMAIL,
        status=NotificationDeliveryStatus.QUEUED,
        idempotency_key=_idempotency_key(notification.id),
        attempts=0,
    )
    provider = FakeEmailProvider()

    class Session:
        async def commit(self) -> None:
            return None

    class SessionContext:
        async def __aenter__(self) -> Session:
            return Session()

        async def __aexit__(self, *_args: object) -> None:
            return None

    async def load_notification(_session: object, _notification_id: int) -> Notification:
        return notification

    async def lock_delivery(_session: object, _notification: Notification) -> NotificationDelivery:
        return delivery

    monkeypatch.setattr("src.services.email_delivery._load_notification", load_notification)
    monkeypatch.setattr("src.services.email_delivery._lock_delivery", lock_delivery)
    monkeypatch.setattr("src.services.email_delivery.settings.email_enabled", True)

    def session_factory() -> SessionContext:
        return SessionContext()

    await deliver_email_notification_async(session_factory, notification.id, provider=provider)
    await deliver_email_notification_async(session_factory, notification.id, provider=provider)

    assert len(provider.messages) == 1
    assert provider.messages[0].idempotency_key == "notification:42:email:v1"
    assert delivery.status == NotificationDeliveryStatus.SENT
    assert delivery.attempts == 1


@pytest.mark.asyncio
async def test_permanent_provider_failure_does_not_change_internal_notification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    notification = _notification()
    original_title = notification.title
    delivery = NotificationDelivery(
        id=5,
        notification_id=notification.id,
        user_id=notification.user_id,
        channel=NotificationDeliveryChannel.EMAIL,
        status=NotificationDeliveryStatus.QUEUED,
        idempotency_key=_idempotency_key(notification.id),
        attempts=0,
    )

    class FailingProvider:
        name = "resend"

        def send(self, _message: EmailMessage):
            raise EmailProviderError("invalid key", code="http_401", retryable=False)

    class Session:
        async def commit(self) -> None:
            return None

    class SessionContext:
        async def __aenter__(self) -> Session:
            return Session()

        async def __aexit__(self, *_args: object) -> None:
            return None

    async def load_notification(_session: object, _notification_id: int) -> Notification:
        return notification

    async def lock_delivery(_session: object, _notification: Notification) -> NotificationDelivery:
        return delivery

    monkeypatch.setattr("src.services.email_delivery._load_notification", load_notification)
    monkeypatch.setattr("src.services.email_delivery._lock_delivery", lock_delivery)
    monkeypatch.setattr("src.services.email_delivery.settings.email_enabled", True)

    await deliver_email_notification_async(
        lambda: SessionContext(),
        notification.id,
        provider=FailingProvider(),
    )

    assert delivery.status == NotificationDeliveryStatus.FAILED
    assert delivery.last_error_code == "http_401"
    assert notification.title == original_title


@pytest.mark.asyncio
async def test_temporary_provider_failure_is_queued_for_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    notification = _notification()
    delivery = NotificationDelivery(
        id=5,
        notification_id=notification.id,
        user_id=notification.user_id,
        channel=NotificationDeliveryChannel.EMAIL,
        status=NotificationDeliveryStatus.QUEUED,
        idempotency_key=_idempotency_key(notification.id),
        attempts=0,
    )

    class TemporaryFailureProvider:
        name = "resend"

        def send(self, _message: EmailMessage):
            raise EmailProviderError("timeout", code="timeout", retryable=True)

    class Session:
        async def commit(self) -> None:
            return None

    class SessionContext:
        async def __aenter__(self) -> Session:
            return Session()

        async def __aexit__(self, *_args: object) -> None:
            return None

    async def load_notification(_session: object, _notification_id: int) -> Notification:
        return notification

    async def lock_delivery(_session: object, _notification: Notification) -> NotificationDelivery:
        return delivery

    monkeypatch.setattr("src.services.email_delivery._load_notification", load_notification)
    monkeypatch.setattr("src.services.email_delivery._lock_delivery", lock_delivery)
    monkeypatch.setattr("src.services.email_delivery.settings.email_enabled", True)

    with pytest.raises(RetryableEmailDeliveryError):
        await deliver_email_notification_async(
            lambda: SessionContext(),
            notification.id,
            provider=TemporaryFailureProvider(),
        )

    assert delivery.status == NotificationDeliveryStatus.QUEUED
    assert delivery.last_error_code == "timeout"


@pytest.mark.parametrize(
    ("locale", "subject_fragment", "deadline_fragment"),
    [
        ("ru", "через 1 час", "17.07.2026, 23:00"),
        ("en", "due in 1 hour", "Jul 17, 2026, 11:00 PM"),
    ],
)
def test_deadline_template_is_localized_and_escapes_task_title(
    locale: str,
    subject_fragment: str,
    deadline_fragment: str,
) -> None:
    rendered = render_notification_email(_notification(locale), locale=locale, config=_settings())

    assert rendered is not None
    assert subject_fragment in rendered.subject
    assert deadline_fragment in rendered.text
    assert "<script>" not in rendered.html
    assert "&lt;script&gt;" in rendered.html
    assert '<script>alert("x")</script>' in rendered.text


def test_workspace_member_notification_is_rendered_for_optional_email(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    notification = _notification()
    notification.type = NotificationType.WORKSPACE_MEMBER_ADDED
    notification.title = "Вас добавили в пространство"
    notification.message = "Вы стали участником команды."
    notification.payload = {"workspace_name": "Engineering"}
    monkeypatch.setattr("src.services.email_delivery.settings.email_enabled", True)

    rendered = render_notification_email(notification, locale="ru", config=_settings())

    assert rendered is not None
    assert "Вас добавили в пространство" in rendered.subject
    assert "Engineering" in rendered.text
    assert _email_skip_reason(notification) is None


@pytest.mark.asyncio
async def test_provider_non_acceptance_is_failed_not_skipped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    notification = _notification()
    delivery = NotificationDelivery(
        id=5,
        notification_id=notification.id,
        user_id=notification.user_id,
        channel=NotificationDeliveryChannel.EMAIL,
        status=NotificationDeliveryStatus.QUEUED,
        idempotency_key=_idempotency_key(notification.id),
        attempts=0,
    )

    class NonAcceptingProvider:
        name = "resend"

        def send(self, _message: EmailMessage) -> EmailSendResult:
            return EmailSendResult(provider=self.name, provider_message_id=None, accepted=False)

    class Session:
        async def commit(self) -> None:
            return None

    class SessionContext:
        async def __aenter__(self) -> Session:
            return Session()

        async def __aexit__(self, *_args: object) -> None:
            return None

    async def load_notification(_session: object, _notification_id: int) -> Notification:
        return notification

    async def lock_delivery(_session: object, _notification: Notification) -> NotificationDelivery:
        return delivery

    monkeypatch.setattr("src.services.email_delivery._load_notification", load_notification)
    monkeypatch.setattr("src.services.email_delivery._lock_delivery", lock_delivery)
    monkeypatch.setattr("src.services.email_delivery.settings.email_enabled", True)

    await deliver_email_notification_async(
        lambda: SessionContext(), notification.id, provider=NonAcceptingProvider()
    )

    assert delivery.status == NotificationDeliveryStatus.FAILED
    assert delivery.last_error_code == "provider_rejected"


@pytest.mark.asyncio
async def test_workspace_member_notification_reaches_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    notification = _notification()
    notification.type = NotificationType.WORKSPACE_MEMBER_ROLE_CHANGED
    notification.title = "Роль изменена"
    notification.message = "Теперь у вас новая роль."
    notification.payload = {"workspace_name": "Engineering"}
    delivery = NotificationDelivery(
        id=6,
        notification_id=notification.id,
        user_id=notification.user_id,
        channel=NotificationDeliveryChannel.EMAIL,
        status=NotificationDeliveryStatus.QUEUED,
        idempotency_key=_idempotency_key(notification.id),
        attempts=0,
    )
    provider = FakeEmailProvider()

    class Session:
        async def commit(self) -> None:
            return None

    class SessionContext:
        async def __aenter__(self) -> Session:
            return Session()

        async def __aexit__(self, *_args: object) -> None:
            return None

    async def load_notification(_session: object, _notification_id: int) -> Notification:
        return notification

    async def lock_delivery(_session: object, _notification: Notification) -> NotificationDelivery:
        return delivery

    monkeypatch.setattr("src.services.email_delivery._load_notification", load_notification)
    monkeypatch.setattr("src.services.email_delivery._lock_delivery", lock_delivery)
    monkeypatch.setattr("src.services.email_delivery.settings.email_enabled", True)

    await deliver_email_notification_async(
        lambda: SessionContext(), notification.id, provider=provider
    )

    assert len(provider.messages) == 1
    assert delivery.status == NotificationDeliveryStatus.SENT
    assert delivery.last_error_code is None


@pytest.mark.asyncio
async def test_transactional_delivery_ignores_notification_opt_out(
    dummy_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    delivery = NotificationDelivery(
        id=8,
        notification_id=None,
        user_id=7,
        channel=NotificationDeliveryChannel.EMAIL,
        status=NotificationDeliveryStatus.QUEUED,
        purpose="workspace_invitation",
        source_id="invitation-id",
        attempts=0,
    )
    provider = FakeEmailProvider()

    async def lock_delivery(*_args: object, **_kwargs: object) -> NotificationDelivery:
        return delivery

    monkeypatch.setattr("src.services.transactional_email._lock_delivery", lock_delivery)
    monkeypatch.setattr("src.services.transactional_email.settings.email_enabled", True)

    rendered = render_notification_email(_notification(), locale="en", config=_settings())
    assert rendered is not None
    await _deliver_transactional(
        dummy_session,
        purpose="workspace_invitation",
        source_id="invitation-id",
        generation=1,
        recipient="member@example.com",
        user_id=7,
        rendered=rendered,
        final_attempt=False,
        provider=provider,
    )

    assert len(provider.messages) == 1
    assert provider.messages[0].idempotency_key == ("workspace-invitation:invitation-id:1:email:v1")
    assert delivery.status == NotificationDeliveryStatus.SENT


@pytest.mark.asyncio
async def test_transactional_provider_non_acceptance_is_failed(
    dummy_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    delivery = NotificationDelivery(
        id=9,
        notification_id=None,
        user_id=None,
        channel=NotificationDeliveryChannel.EMAIL,
        status=NotificationDeliveryStatus.QUEUED,
        purpose="registration_verification",
        source_id="verification-id",
        attempts=0,
    )

    class NonAcceptingProvider:
        name = "resend"

        def send(self, _message: EmailMessage) -> EmailSendResult:
            return EmailSendResult(provider=self.name, provider_message_id=None, accepted=False)

    async def lock_delivery(*_args: object, **_kwargs: object) -> NotificationDelivery:
        return delivery

    monkeypatch.setattr("src.services.transactional_email._lock_delivery", lock_delivery)
    monkeypatch.setattr("src.services.transactional_email.settings.email_enabled", True)
    rendered = render_notification_email(_notification(), locale="en", config=_settings())
    assert rendered is not None

    await _deliver_transactional(
        dummy_session,
        purpose="registration_verification",
        source_id="verification-id",
        generation=1,
        recipient="new@example.com",
        user_id=None,
        rendered=rendered,
        final_attempt=False,
        provider=NonAcceptingProvider(),
    )

    assert delivery.status == NotificationDeliveryStatus.FAILED
    assert delivery.last_error_code == "provider_rejected"


def test_delivery_idempotency_key_is_stable_and_contains_no_recipient() -> None:
    assert _idempotency_key(42) == "notification:42:email:v1"
    assert "@" not in _idempotency_key(42)


def test_protected_space_notification_is_email_skipped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    notification = _notification()
    notification.task = Task(
        id=9,
        title="Protected",
        workspace_id=3,
        user_id=7,
        workspace=Workspace(
            id=3,
            owner_id=7,
            name="Protected",
            is_protected=True,
        ),
    )
    monkeypatch.setattr("src.services.email_delivery.settings.email_enabled", True)

    assert _email_skip_reason(notification) == "protected_space"


@pytest.mark.parametrize(
    ("mutator", "reason"),
    [
        (lambda user: setattr(user, "email_notifications_enabled", False), "user_opt_out"),
        (lambda user: setattr(user, "is_active", False), "inactive_user"),
        (lambda user: setattr(user, "email", ""), "missing_email"),
    ],
)
def test_ineligible_recipient_is_skipped(
    monkeypatch: pytest.MonkeyPatch,
    mutator,
    reason: str,
) -> None:
    notification = _notification()
    mutator(notification.user)
    monkeypatch.setattr("src.services.email_delivery.settings.email_enabled", True)

    assert _email_skip_reason(notification) == reason


@pytest.mark.asyncio
async def test_preferences_are_opt_in_and_can_be_saved(dummy_session) -> None:
    user = _notification().user
    user.email_notifications_enabled = False
    user.email_deadline_24h = False
    user.email_deadline_1h = False
    user.email_deadline_overdue = False
    user.email_suppressed_at = datetime.now(UTC)

    before = get_notification_preferences(user)
    assert before.email_enabled is False
    assert before.email_suppressed is True

    updated = await update_notification_preferences(
        dummy_session,
        user,
        NotificationPreferencesUpdate(
            locale="en",
            email_enabled=True,
            deadline_24h=True,
            deadline_1h=True,
            deadline_overdue=True,
        ),
    )
    assert updated.email_enabled is True
    assert updated.email_suppressed is False
    assert dummy_session.committed is True


@pytest.mark.asyncio
async def test_partial_preferences_patch_preserves_unset_fields(dummy_session) -> None:
    user = _notification().user
    user.locale = "ru"
    user.email_notifications_enabled = True
    user.email_deadline_24h = True
    user.email_deadline_1h = False
    user.email_deadline_overdue = True

    updated = await update_notification_preferences(
        dummy_session,
        user,
        NotificationPreferencesUpdate(deadline_1h=True),
    )

    assert updated.locale == "ru"
    assert updated.email_enabled is True
    assert updated.deadline_24h is True
    assert updated.deadline_1h is True
    assert updated.deadline_overdue is True


@pytest.mark.asyncio
async def test_diagnostic_is_read_only_and_masks_recipient(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    notification = _notification()

    class DiagnosticResult:
        def __init__(self, value: object) -> None:
            self.value = value

        def scalar_one_or_none(self) -> object:
            return self.value

    class Session:
        committed = False

        def __init__(self) -> None:
            self.results = [DiagnosticResult(notification), DiagnosticResult(None)]

        async def execute(self, _stmt: object) -> DiagnosticResult:
            return self.results.pop(0)

    session = Session()

    class SessionContext:
        async def __aenter__(self) -> Session:
            return session

        async def __aexit__(self, *_args: object) -> None:
            return None

    monkeypatch.setattr(
        "src.cli.diagnose_email_notification.AsyncSessionFactory", lambda: SessionContext()
    )
    monkeypatch.setattr("src.services.email_delivery.settings.email_enabled", True)

    result = await diagnose(notification.id)

    assert result["decision"] == "send"
    assert result["recipient_masked"] == "o***@example.com"
    assert "owner@example.com" not in json.dumps(result)
    assert session.committed is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("event_type", "expected_status", "suppressed"),
    [
        ("email.delivered", NotificationDeliveryStatus.DELIVERED, False),
        ("email.bounced", NotificationDeliveryStatus.BOUNCED, True),
        ("email.complained", NotificationDeliveryStatus.COMPLAINED, True),
    ],
)
async def test_webhook_delivery_transitions(
    dummy_session,
    event_type: str,
    expected_status: NotificationDeliveryStatus,
    suppressed: bool,
) -> None:
    user = _notification().user
    delivery = NotificationDelivery(
        id=5,
        notification_id=42,
        user_id=user.id,
        channel=NotificationDeliveryChannel.EMAIL,
        status=NotificationDeliveryStatus.SENT,
    )
    dummy_session.get_map[(User, user.id)] = user

    await _apply_delivery_event(dummy_session, delivery, event_type)

    assert delivery.status == expected_status
    assert (user.email_suppressed_at is not None) is suppressed
    assert user.email_notifications_enabled is (not suppressed)


@pytest.mark.asyncio
async def test_out_of_order_sent_event_does_not_downgrade_delivered(dummy_session) -> None:
    delivery = NotificationDelivery(
        id=5,
        notification_id=42,
        user_id=7,
        channel=NotificationDeliveryChannel.EMAIL,
        status=NotificationDeliveryStatus.DELIVERED,
    )

    await _apply_delivery_event(dummy_session, delivery, "email.sent")

    assert delivery.status == NotificationDeliveryStatus.DELIVERED


@pytest.mark.asyncio
async def test_resend_webhook_rejects_invalid_signature(
    test_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "whsec_" + base64.b64encode(b"test-webhook-secret-32-bytes!!!").decode()
    monkeypatch.setattr("src.api.webhooks.settings.resend_webhook_secret", secret)

    response = await test_client.post(
        "/api/v1/webhooks/resend",
        content=b"{}",
        headers={
            "svix-id": "msg_invalid",
            "svix-timestamp": "1",
            "svix-signature": "v1,invalid",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid webhook signature"


@pytest.mark.asyncio
async def test_resend_webhook_accepts_valid_signature(
    test_client,
    dummy_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.db.session import get_db_session
    from src.main import app

    secret = "whsec_" + base64.b64encode(b"test-webhook-secret-32-bytes!!!").decode()
    message_id = "msg_valid"
    timestamp = datetime.now(UTC)
    body = json.dumps(
        {"type": "email.delivered", "data": {"email_id": "email-123"}},
        separators=(",", ":"),
    )
    signature = Webhook(secret).sign(message_id, timestamp, body)

    async def override_session():
        yield dummy_session

    app.dependency_overrides[get_db_session] = override_session
    monkeypatch.setattr("src.api.webhooks.settings.resend_webhook_secret", secret)
    try:
        response = await test_client.post(
            "/api/v1/webhooks/resend",
            content=body,
            headers={
                "content-type": "application/json",
                "svix-id": message_id,
                "svix-timestamp": str(int(timestamp.timestamp())),
                "svix-signature": signature,
            },
        )
    finally:
        app.dependency_overrides.pop(get_db_session, None)

    assert response.status_code == 204
    assert dummy_session.committed is True
    assert len(dummy_session.items) == 1


@pytest.mark.asyncio
async def test_duplicate_resend_webhook_is_idempotent(dummy_session) -> None:
    class ExistingEventResult:
        def scalar_one_or_none(self) -> int:
            return 10

    dummy_session.execute_results = [ExistingEventResult()]

    await _persist_resend_event(
        dummy_session,
        {"type": "email.delivered", "data": {"email_id": "email-123"}},
        "msg_duplicate",
    )

    assert dummy_session.items == []
    assert dummy_session.committed is False
