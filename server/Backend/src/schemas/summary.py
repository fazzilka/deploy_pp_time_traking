from datetime import date

from pydantic import BaseModel, ConfigDict

from src.models.enums import TaskPriority


class SummaryTask(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    total_time_seconds: int
    deadline: date | None = None
    priority: TaskPriority = TaskPriority.MEDIUM


class SummaryResponse(BaseModel):
    total_time_seconds_all_tasks: int
    top_tasks: list[SummaryTask]
