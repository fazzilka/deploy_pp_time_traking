from datetime import date, datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.models.enums import TaskPriority

HEX_COLOR_PATTERN = r"^#[0-9a-fA-F]{6}$"


class ProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    color: str = Field(default="#2ea043", pattern=HEX_COLOR_PATTERN)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("description")
    @classmethod
    def trim_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @model_validator(mode="after")
    def validate_name(self) -> Self:
        if not self.name:
            raise ValueError("Название проекта не может быть пустым")
        return self


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    color: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)
    is_archived: bool | None = None

    @field_validator("name")
    @classmethod
    def trim_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Название проекта не может быть пустым")
        return value

    @field_validator("description")
    @classmethod
    def trim_optional_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    color: str
    is_archived: bool
    created_at: datetime
    updated_at: datetime


class ProjectBadge(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str


class ProjectListItem(ProjectRead):
    tasks_count: int
    active_tasks_count: int
    tasks_with_time_count: int
    total_time_seconds: int


class ProjectSummaryTask(BaseModel):
    id: int
    title: str
    description: str | None = None
    total_time_seconds: int
    deadline: date | None = None
    priority: TaskPriority = TaskPriority.MEDIUM


class ProjectSummary(ProjectRead):
    tasks_count: int
    active_tasks_count: int
    tasks_with_time_count: int
    total_time_seconds: int
    top_tasks: list[ProjectSummaryTask]


class ProjectTimeSummaryItem(BaseModel):
    project_id: int | None
    name: str
    color: str
    tasks_count: int
    active_tasks_count: int
    total_time_seconds: int
    percentage: float
