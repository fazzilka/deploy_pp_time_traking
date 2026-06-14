from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, model_validator


class TimeIntervalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None = None
    started_at: datetime
    ended_at: datetime | None

    @model_validator(mode="before")
    @classmethod
    def use_frontend_field_names(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "ended_at" not in data and "finished_at" in data:
                return {**data, "ended_at": data["finished_at"]}
            return data

        if hasattr(data, "finished_at"):
            return {
                "id": data.id,
                "user_id": getattr(data, "user_id", None),
                "started_at": data.started_at,
                "ended_at": data.finished_at,
            }

        return data
