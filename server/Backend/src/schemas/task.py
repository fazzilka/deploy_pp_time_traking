from datetime import datetime
from typing import Any

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)

from src.core.deadlines import format_utc_iso, normalize_deadline
from src.models.enums import TaskPriority
from src.schemas.project import ProjectBadge
from src.schemas.time_interval import TimeIntervalRead


class DeadlineNormalizer(BaseModel):
    @field_validator("deadline", mode="before", check_fields=False)
    @classmethod
    def normalize_deadline_value(cls, value: object) -> datetime | None:
        return normalize_deadline(value)  # type: ignore[arg-type]


class TaskBase(DeadlineNormalizer):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    deadline: datetime | None = None
    priority: TaskPriority = TaskPriority.MEDIUM
    workspace_id: int | None = None
    project_id: int | None = None
    assignee_id: int | None = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(DeadlineNormalizer):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    deadline: datetime | None = None
    priority: TaskPriority | None = None
    project_id: int | None = None
    assignee_id: int | None = None
    is_completed: bool | None = None


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    total_time_seconds: int
    deadline: datetime | None = None
    priority: TaskPriority = TaskPriority.MEDIUM
    workspace_id: int | None = None
    project_id: int | None = None
    created_by_id: int | None = None
    assignee_id: int | None = None
    project: ProjectBadge | None = None
    is_completed: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None
    time_intervals: list[TimeIntervalRead] = Field(default_factory=list)

    @field_serializer("deadline")
    def serialize_deadline(self, value: datetime | None) -> str | None:
        if value is None:
            return None
        return format_utc_iso(value)

    @model_validator(mode="before")
    @classmethod
    def use_frontend_field_names(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "time_intervals" not in data and "intervals" in data:
                return {**data, "time_intervals": data["intervals"]}
            return data

        if hasattr(data, "intervals"):
            return {
                "id": data.id,
                "title": data.title,
                "description": data.description,
                "total_time_seconds": data.total_time_seconds,
                "deadline": getattr(data, "deadline", None),
                "priority": getattr(data, "priority", TaskPriority.MEDIUM),
                "workspace_id": getattr(data, "workspace_id", None),
                "project_id": getattr(data, "project_id", None),
                "created_by_id": getattr(data, "created_by_id", None),
                "assignee_id": getattr(data, "assignee_id", None),
                "project": getattr(data, "__dict__", {}).get("project"),
                "is_completed": getattr(data, "is_completed", False),
                "created_at": getattr(data, "created_at", None),
                "updated_at": getattr(data, "updated_at", None),
                "time_intervals": data.intervals,
            }

        return data
