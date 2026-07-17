from __future__ import annotations

from typing import Any
from uuid import UUID

from src.core.celery_app import celery_app
from src.core.config import settings
from src.services.email_delivery import RetryableEmailDeliveryError
from src.services.transactional_email import (
    deliver_registration_verification_email,
    deliver_workspace_invitation_email,
)
from src.tasks.db import run_async_celery_task, run_celery_db_task


def _retry_countdown(retries: int) -> int:
    return int(settings.email_retry_base_seconds * (2**retries))


@celery_app.task(  # type: ignore[untyped-decorator]
    bind=True,
    name="src.tasks.transactional_email.send_registration_verification_email",
    max_retries=settings.email_max_retries,
)
def send_registration_verification_email(
    self: Any,
    verification_id: str,
    generation: int,
    code: str,
) -> None:
    retries = int(self.request.retries)
    try:
        run_async_celery_task(
            lambda: run_celery_db_task(
                lambda session_factory: deliver_registration_verification_email(
                    session_factory,
                    UUID(verification_id),
                    generation,
                    code,
                    final_attempt=retries >= settings.email_max_retries,
                )
            )
        )
    except RetryableEmailDeliveryError as exc:
        raise self.retry(exc=exc, countdown=_retry_countdown(retries)) from exc


@celery_app.task(  # type: ignore[untyped-decorator]
    bind=True,
    name="src.tasks.transactional_email.send_workspace_invitation_email",
    max_retries=settings.email_max_retries,
)
def send_workspace_invitation_email(
    self: Any,
    invitation_id: str,
    generation: int,
    token: str,
) -> None:
    retries = int(self.request.retries)
    try:
        run_async_celery_task(
            lambda: run_celery_db_task(
                lambda session_factory: deliver_workspace_invitation_email(
                    session_factory,
                    UUID(invitation_id),
                    generation,
                    token,
                    final_attempt=retries >= settings.email_max_retries,
                )
            )
        )
    except RetryableEmailDeliveryError as exc:
        raise self.retry(exc=exc, countdown=_retry_countdown(retries)) from exc
