from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.schemas.time_interval import TimeIntervalRead


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = ""


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    total_time_seconds: int
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
                "created_at": getattr(data, "created_at", None),
                "updated_at": getattr(data, "updated_at", None),
                "time_intervals": data.intervals,
            }

        return data
