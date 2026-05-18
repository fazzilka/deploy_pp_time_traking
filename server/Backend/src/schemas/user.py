from datetime import date, datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from src.models.enums import UserRole


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    username: str
    full_name: str | None = None
    role: UserRole
    is_active: bool
    avatar_letter: str = ""

    @model_validator(mode="after")
    def fill_avatar_letter(self) -> Self:
        if not self.avatar_letter:
            source = self.full_name.strip() if self.full_name else self.username
            self.avatar_letter = source[:1].upper()
        return self


class ProfileStats(BaseModel):
    tasks_count: int
    tasks_with_time_count: int
    total_time_seconds: int
    current_streak_days: int
    max_streak_days: int


class UserProfile(UserPublic):
    created_at: datetime
    stats: ProfileStats


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str | None = Field(default=None, min_length=1, max_length=64)
    full_name: str | None = Field(default=None, max_length=255)


class ActivityDay(BaseModel):
    date: date
    intervals_count: int
    total_time_seconds: int
    level: int


class ActivitySummary(BaseModel):
    active_days_count: int
    current_streak_days: int
    max_streak_days: int
    total_intervals_count: int
    total_time_seconds: int


class ActivityResponse(BaseModel):
    year: int | None
    days: list[ActivityDay]
    summary: ActivitySummary


class AdminUserStats(BaseModel):
    tasks_count: int
    total_time_seconds: int


class AdminUserRead(UserPublic):
    created_at: datetime
    stats: AdminUserStats


class AdminUserListResponse(BaseModel):
    items: list[AdminUserRead]
    total: int


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str | None = Field(default=None, min_length=1, max_length=64)
    full_name: str | None = Field(default=None, max_length=255)
    role: UserRole | None = None
    is_active: bool | None = None


class TopUserStats(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    avatar_letter: str
    total_time_seconds: int


class AdminSystemStats(BaseModel):
    users_count: int
    active_users_count: int
    admins_count: int
    tasks_count: int
    total_time_seconds: int
    top_users: list[TopUserStats]
