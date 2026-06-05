from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.security import get_password_hash, verify_password
from src.models.task import Task
from src.models.time_interval import TimeInterval
from src.models.user import User
from src.schemas.user import (
    ActivityDay,
    ActivityResponse,
    ActivitySummary,
    ProfileStats,
    UserProfile,
    UserUpdate,
)

LEVEL_THRESHOLDS_SECONDS = (1, 1800, 3600, 7200)
DATETIME_TYPE = datetime


@dataclass(frozen=True)
class DayActivity:
    intervals_count: int = 0
    total_time_seconds: int = 0


def get_avatar_letter(user: User) -> str:
    source = user.full_name.strip() if user.full_name else user.username
    return source[:1].upper()


async def get_user_profile(session: AsyncSession, user: User) -> UserProfile:
    stats = await get_profile_stats(session, user.id)
    public_user = UserProfile.model_validate(
        {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "stats": stats,
        }
    )
    return public_user


async def update_user_profile(
    session: AsyncSession, user: User, payload: UserUpdate
) -> UserProfile:
    values = payload.model_dump(exclude_unset=True)
    username = values.get("username")
    if username is not None and username != user.username:
        existing = await get_user_by_username(session, username)
        if existing is not None and existing.id != user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username уже занят",
            )
        user.username = username
    if "full_name" in values:
        user.full_name = values["full_name"]
    await session.commit()
    await session.refresh(user)
    return await get_user_profile(session, user)


async def change_password(
    session: AsyncSession,
    user: User,
    *,
    old_password: str,
    new_password: str,
) -> None:
    if not verify_password(old_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Старый пароль указан неверно",
        )
    if verify_password(new_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Новый пароль должен отличаться от старого",
        )

    user.hashed_password = get_password_hash(new_password)
    await session.commit()
    await session.refresh(user)


async def get_user_by_username(session: AsyncSession, username: str) -> User | None:
    result = await session.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_profile_stats(session: AsyncSession, user_id: int) -> ProfileStats:
    tasks_with_time = func.coalesce(
        func.sum(case((Task.total_time_seconds > 0, 1), else_=0)),
        0,
    )
    stats_result = await session.execute(
        select(
            func.count(Task.id),
            tasks_with_time,
            func.coalesce(func.sum(Task.total_time_seconds), 0),
        ).where(Task.user_id == user_id)
    )
    tasks_count, tasks_with_time_count, total_time_seconds = stats_result.one()
    activity = await get_activity(session, user_id)
    return ProfileStats(
        tasks_count=int(tasks_count),
        tasks_with_time_count=int(tasks_with_time_count),
        total_time_seconds=int(total_time_seconds),
        current_streak_days=activity.summary.current_streak_days,
        max_streak_days=activity.summary.max_streak_days,
    )


async def get_activity(
    session: AsyncSession,
    user_id: int,
    *,
    year: int | None = None,
) -> ActivityResponse:
    start_date, end_date = _activity_period(year)
    raw_activity = await _load_day_activity(session, user_id, start_date, end_date)
    days: list[ActivityDay] = []
    total_intervals = 0
    total_time = 0
    active_dates: set[date] = set()

    for current_day in _iter_days(start_date, end_date):
        day_activity = raw_activity.get(current_day, DayActivity())
        level = get_activity_level(day_activity.total_time_seconds)
        if day_activity.intervals_count > 0:
            active_dates.add(current_day)
        total_intervals += day_activity.intervals_count
        total_time += day_activity.total_time_seconds
        days.append(
            ActivityDay(
                date=current_day,
                intervals_count=day_activity.intervals_count,
                total_time_seconds=day_activity.total_time_seconds,
                level=level,
            )
        )

    anchor_date = min(datetime.now(UTC).date(), end_date)
    summary = ActivitySummary(
        active_days_count=len(active_dates),
        current_streak_days=count_current_streak(active_dates, anchor_date),
        max_streak_days=count_max_streak(active_dates),
        total_intervals_count=total_intervals,
        total_time_seconds=total_time,
    )
    return ActivityResponse(year=year, days=days, summary=summary)


def get_activity_level(total_time_seconds: int) -> int:
    if total_time_seconds <= 0:
        return 0
    if total_time_seconds < LEVEL_THRESHOLDS_SECONDS[1]:
        return 1
    if total_time_seconds < LEVEL_THRESHOLDS_SECONDS[2]:
        return 2
    if total_time_seconds < LEVEL_THRESHOLDS_SECONDS[3]:
        return 3
    return 4


def count_current_streak(active_dates: set[date], anchor_date: date) -> int:
    streak = 0
    current_day = anchor_date
    while current_day in active_dates:
        streak += 1
        current_day -= timedelta(days=1)
    return streak


def count_max_streak(active_dates: Iterable[date]) -> int:
    max_streak = 0
    current_streak = 0
    previous_day: date | None = None
    for current_day in sorted(active_dates):
        if previous_day is None or current_day == previous_day + timedelta(days=1):
            current_streak += 1
        else:
            current_streak = 1
        max_streak = max(max_streak, current_streak)
        previous_day = current_day
    return max_streak


async def _load_day_activity(
    session: AsyncSession,
    user_id: int,
    start_date: date,
    end_date: date,
) -> dict[date, DayActivity]:
    start_at = datetime.combine(start_date, time.min, tzinfo=UTC)
    end_at = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=UTC)
    activity_date = func.date(TimeInterval.finished_at)
    duration_seconds = func.extract("epoch", TimeInterval.finished_at - TimeInterval.started_at)
    non_negative_duration = case((duration_seconds < 0, 0), else_=duration_seconds)
    stmt = (
        select(
            activity_date,
            func.count(TimeInterval.id),
            func.coalesce(func.sum(non_negative_duration), 0),
        )
        .join(Task, Task.id == TimeInterval.task_id)
        .where(
            Task.user_id == user_id,
            TimeInterval.finished_at.is_not(None),
            TimeInterval.finished_at >= start_at,
            TimeInterval.finished_at < end_at,
        )
        .group_by(activity_date)
    )
    result = await session.execute(stmt)
    activity: dict[date, DayActivity] = {}
    for raw_activity_date, intervals_count, total_time_seconds in result.all():
        current_date = _coerce_date(raw_activity_date)
        activity[current_date] = DayActivity(
            intervals_count=int(intervals_count or 0),
            total_time_seconds=int(total_time_seconds or 0),
        )
    return activity


def _activity_period(year: int | None) -> tuple[date, date]:
    if year is not None:
        return date(year, 1, 1), date(year, 12, 31)
    end_date = datetime.now(UTC).date()
    return end_date - timedelta(days=364), end_date


def _iter_days(start_date: date, end_date: date) -> Iterable[date]:
    current_day = start_date
    while current_day <= end_date:
        yield current_day
        current_day += timedelta(days=1)


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _coerce_date(value: date | datetime | str) -> date:
    if isinstance(value, DATETIME_TYPE):
        return _to_utc(value).date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)
