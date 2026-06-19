# ruff: noqa: UP017
from __future__ import annotations

from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from src.core.config import settings

DATE_ONLY_LENGTH = 10


def app_timezone() -> ZoneInfo:
    try:
        return ZoneInfo(settings.app_timezone)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def normalize_deadline(value: date | datetime | str | None) -> datetime | None:
    if value is None or value == "":
        return None

    if isinstance(value, datetime):
        deadline = value
    elif isinstance(value, date):
        deadline = datetime.combine(value, time.max)
    elif isinstance(value, str):
        stripped_value = value.strip()
        if not stripped_value:
            return None
        if len(stripped_value) == DATE_ONLY_LENGTH and stripped_value.count("-") == 2:
            deadline = datetime.combine(date.fromisoformat(stripped_value), time.max)
        else:
            deadline = datetime.fromisoformat(stripped_value.replace("Z", "+00:00"))
    else:
        raise TypeError("Unsupported deadline value")

    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=app_timezone())
    return deadline.astimezone(timezone.utc)


def normalize_deadline_query(value: str | None, *, boundary: str) -> datetime | None:
    if value is None or not value.strip():
        return None

    stripped_value = value.strip()
    if len(stripped_value) == DATE_ONLY_LENGTH and stripped_value.count("-") == 2:
        local_time = time.min if boundary == "start" else time.max
        deadline = datetime.combine(date.fromisoformat(stripped_value), local_time)
        return deadline.replace(tzinfo=app_timezone()).astimezone(timezone.utc)

    return normalize_deadline(stripped_value)


def ensure_utc(value: date | datetime | None) -> datetime | None:
    return normalize_deadline(value)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def format_utc_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def format_deadline_readable(value: datetime) -> str:
    local_value = value.astimezone(app_timezone())
    return local_value.strftime("%d.%m.%Y %H:%M")
