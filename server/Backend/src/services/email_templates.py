from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from html import escape
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from src.core.config import Settings
from src.core.deadlines import ensure_utc
from src.models.enums import NotificationType
from src.models.notification import Notification


@dataclass(frozen=True)
class RenderedEmail:
    subject: str
    html: str
    text: str


def render_notification_email(
    notification: Notification,
    *,
    locale: str,
    config: Settings,
) -> RenderedEmail | None:
    if notification.type not in {
        NotificationType.DEADLINE_SOON,
        NotificationType.DEADLINE_OVERDUE,
    }:
        return None

    normalized_locale = locale if locale in {"ru", "en"} else config.email_default_locale
    payload = notification.payload or {}
    task_title = str(payload.get("task_title") or "")
    deadline = _parse_datetime(payload.get("deadline"))
    deadline_text = _format_deadline(deadline, normalized_locale, config.app_timezone)
    reminder_minutes = int(payload.get("remind_before_minutes") or 0)
    task_url = (
        f"{config.email_base_url.rstrip('/')}/dashboard?{urlencode({'task': notification.task_id})}"
    )

    if normalized_locale == "ru":
        subject, heading, body = _render_ru(
            notification.type, task_title, deadline_text, reminder_minutes
        )
        open_task = "Открыть задачу"
        reason = "Вы получили это письмо, потому что включили email-уведомления о дедлайнах."
        preferences = "Настройки уведомлений"
    else:
        subject, heading, body = _render_en(
            notification.type, task_title, deadline_text, reminder_minutes
        )
        open_task = "Open task"
        reason = "You received this email because deadline email notifications are enabled."
        preferences = "Notification settings"

    safe_heading = escape(heading)
    safe_body = escape(body)
    safe_open_task = escape(open_task)
    safe_reason = escape(reason)
    safe_preferences = escape(preferences)
    safe_task_url = escape(task_url, quote=True)
    preferences_url = escape(f"{config.email_base_url.rstrip('/')}/profile", quote=True)
    cta_style = (
        "display:inline-block;padding:11px 16px;border-radius:6px;"
        "background:#1f883d;color:#fff;text-decoration:none;font-weight:700"
    )
    footer_style = (
        "margin:28px 0 0;padding-top:18px;border-top:1px solid #d8dee4;"
        "color:#6e7781;font-size:12px;line-height:1.5"
    )
    html = f"""<!doctype html>
<html lang="{normalized_locale}">
  <body style="margin:0;background:#f6f8fa;color:#24292f;font-family:Arial,sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr><td align="center" style="padding:24px 12px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
          style="max-width:600px;background:#ffffff;border:1px solid #d0d7de;border-radius:8px">
          <tr><td style="padding:24px 28px">
            <div style="font-size:14px;font-weight:700;color:#57606a">Time Tracking</div>
            <h1 style="margin:18px 0 12px;font-size:24px;line-height:1.3">{safe_heading}</h1>
            <p style="margin:0 0 22px;font-size:16px;line-height:1.55">{safe_body}</p>
            <a href="{safe_task_url}"
              style="{cta_style}">{safe_open_task}</a>
            <p style="{footer_style}">
              {safe_reason} <a href="{preferences_url}" style="color:#0969da">{safe_preferences}</a>
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>"""
    text = f"Time Tracking\n\n{heading}\n\n{body}\n\n{open_task}: {task_url}\n\n{reason}"
    return RenderedEmail(subject=subject, html=html, text=text)


def _render_ru(
    notification_type: NotificationType,
    task_title: str,
    deadline: str,
    reminder_minutes: int,
) -> tuple[str, str, str]:
    quoted_title = f"«{task_title}»"
    if notification_type == NotificationType.DEADLINE_OVERDUE:
        heading = "Дедлайн просрочен"
        return (
            f"Дедлайн задачи {quoted_title} просрочен",
            heading,
            f"Задача {quoted_title} просрочена. Дедлайн был {deadline}.",
        )
    duration = "24 часа" if reminder_minutes >= 1440 else "1 час"
    heading = f"Дедлайн через {duration}"
    return (
        f"Дедлайн задачи {quoted_title} через {duration}",
        heading,
        f"До дедлайна задачи {quoted_title} осталось примерно {duration}. Дедлайн: {deadline}.",
    )


def _render_en(
    notification_type: NotificationType,
    task_title: str,
    deadline: str,
    reminder_minutes: int,
) -> tuple[str, str, str]:
    quoted_title = f"“{task_title}”"
    if notification_type == NotificationType.DEADLINE_OVERDUE:
        return (
            f"Task {quoted_title} is overdue",
            "Deadline overdue",
            f"Task {quoted_title} is overdue. The deadline was {deadline}.",
        )
    duration = "24 hours" if reminder_minutes >= 1440 else "1 hour"
    return (
        f"Task {quoted_title} is due in {duration}",
        f"Deadline in {duration}",
        f"The deadline for task {quoted_title} is about {duration} away. Deadline: {deadline}.",
    )


def _parse_datetime(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return ensure_utc(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except ValueError:
        return None


def _format_deadline(value: datetime | None, locale: str, timezone_name: str) -> str:
    if value is None:
        return "—"
    localized = value.astimezone(ZoneInfo(timezone_name))
    if locale == "ru":
        return localized.strftime("%d.%m.%Y, %H:%M")
    return localized.strftime("%b %-d, %Y, %-I:%M %p")
