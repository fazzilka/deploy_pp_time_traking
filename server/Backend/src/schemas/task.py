from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.models.enums import TaskPriority
from src.schemas.project import ProjectBadge
from src.schemas.time_interval import TimeIntervalRead


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    deadline: date | None = None
    priority: TaskPriority = TaskPriority.MEDIUM
    project_id: int | None = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    deadline: date | None = None
    priority: TaskPriority | None = None
    project_id: int | None = None
    is_completed: bool | None = None


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    total_time_seconds: int
    deadline: date | None = None
    priority: TaskPriority = TaskPriority.MEDIUM
    project_id: int | None = None
    project: ProjectBadge | None = None
    is_completed: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None
    time_intervals: list[TimeIntervalRead] = Field(default_factory=list)

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
                "project_id": getattr(data, "project_id", None),
                "project": getattr(data, "__dict__", {}).get("project"),
                "is_completed": getattr(data, "is_completed", False),
                "created_at": getattr(data, "created_at", None),
                "updated_at": getattr(data, "updated_at", None),
                "time_intervals": data.intervals,
            }

        return data
