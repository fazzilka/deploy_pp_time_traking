from __future__ import annotations

import smtplib
from dataclasses import dataclass
from email.message import EmailMessage as SmtpMessage
from functools import lru_cache
from typing import Protocol

import httpx

from src.core.config import Settings, settings


@dataclass(frozen=True)
class EmailMessage:
    recipient: str
    sender: str
    subject: str
    html: str
    text: str | None
    idempotency_key: str
    reply_to: str | None = None
    tags: dict[str, str] | None = None


@dataclass(frozen=True)
class EmailSendResult:
    provider: str
    provider_message_id: str | None
    accepted: bool


class EmailProviderError(RuntimeError):
    def __init__(self, message: str, *, code: str, retryable: bool) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class EmailProvider(Protocol):
    name: str

    def send(self, message: EmailMessage) -> EmailSendResult: ...


class DisabledEmailProvider:
    name = "disabled"

    def send(self, message: EmailMessage) -> EmailSendResult:
        del message
        return EmailSendResult(provider=self.name, provider_message_id=None, accepted=False)


class ResendEmailProvider:
    name = "resend"

    def __init__(self, config: Settings) -> None:
        self._client = httpx.Client(
            base_url=config.resend_api_url.rstrip("/"),
            timeout=config.email_request_timeout_seconds,
            headers={
                "Authorization": f"Bearer {config.resend_api_key}",
                "Content-Type": "application/json",
                "User-Agent": "time-tracking-email/1.0",
            },
        )

    def send(self, message: EmailMessage) -> EmailSendResult:
        payload: dict[str, object] = {
            "from": message.sender,
            "to": [message.recipient],
            "subject": message.subject,
            "html": message.html,
        }
        if message.text:
            payload["text"] = message.text
        if message.reply_to:
            payload["reply_to"] = message.reply_to
        if message.tags:
            payload["tags"] = [
                {"name": name[:256], "value": value[:256]} for name, value in message.tags.items()
            ]

        try:
            response = self._client.post(
                "/emails",
                headers={"Idempotency-Key": message.idempotency_key},
                json=payload,
            )
        except httpx.TimeoutException as exc:
            raise EmailProviderError(
                "Resend request timed out", code="timeout", retryable=True
            ) from exc
        except httpx.NetworkError as exc:
            raise EmailProviderError(
                "Resend network request failed", code="network_error", retryable=True
            ) from exc

        if response.is_success:
            try:
                response_payload = response.json()
            except ValueError as exc:
                raise EmailProviderError(
                    "Resend returned an invalid response",
                    code="invalid_response",
                    retryable=False,
                ) from exc
            message_id = response_payload.get("id")
            return EmailSendResult(
                provider=self.name,
                provider_message_id=message_id if isinstance(message_id, str) else None,
                accepted=True,
            )

        code = f"http_{response.status_code}"
        retryable = response.status_code == 429 or response.status_code >= 500
        if response.status_code == 409:
            retryable = True
            code = "idempotency_in_progress"
        raise EmailProviderError(
            "Resend rejected the email request",
            code=code,
            retryable=retryable,
        )


class SmtpEmailProvider:
    name = "smtp"

    def __init__(self, config: Settings) -> None:
        self._settings = config

    def send(self, message: EmailMessage) -> EmailSendResult:
        smtp_message = SmtpMessage()
        smtp_message["Subject"] = message.subject
        smtp_message["From"] = message.sender
        smtp_message["To"] = message.recipient
        if message.reply_to:
            smtp_message["Reply-To"] = message.reply_to
        smtp_message.set_content(message.text or "")
        smtp_message.add_alternative(message.html, subtype="html")

        try:
            smtp_class = smtplib.SMTP_SSL if self._settings.smtp_use_ssl else smtplib.SMTP
            with smtp_class(
                self._settings.smtp_host,
                self._settings.smtp_port,
                timeout=self._settings.email_request_timeout_seconds,
            ) as client:
                if self._settings.smtp_use_tls and not self._settings.smtp_use_ssl:
                    client.starttls()
                client.login(self._settings.smtp_username, self._settings.smtp_password)
                client.send_message(smtp_message)
        except (TimeoutError, OSError, smtplib.SMTPServerDisconnected) as exc:
            raise EmailProviderError(
                "SMTP connection failed", code="smtp_connection", retryable=True
            ) from exc
        except smtplib.SMTPResponseException as exc:
            retryable = exc.smtp_code == 429 or exc.smtp_code >= 500
            raise EmailProviderError(
                "SMTP rejected the email", code=f"smtp_{exc.smtp_code}", retryable=retryable
            ) from exc

        return EmailSendResult(provider=self.name, provider_message_id=None, accepted=True)


class FakeEmailProvider:
    name = "fake"

    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> EmailSendResult:
        self.messages.append(message)
        return EmailSendResult(
            provider=self.name,
            provider_message_id=f"fake-{len(self.messages)}",
            accepted=True,
        )


def format_sender(name: str, email: str) -> str:
    return f"{name.strip()} <{email.strip()}>" if name.strip() else email.strip()


@lru_cache(maxsize=1)
def get_email_provider() -> EmailProvider:
    provider = settings.configured_email_provider
    if not settings.outbound_email_enabled or provider == "disabled":
        return DisabledEmailProvider()
    if provider == "resend":
        return ResendEmailProvider(settings)
    return SmtpEmailProvider(settings)
