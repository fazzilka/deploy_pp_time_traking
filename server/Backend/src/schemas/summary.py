from pydantic import BaseModel

from src.schemas.task import TaskRead


class SummaryResponse(BaseModel):
    total_time_seconds: int
    top_tasks: list[TaskRead]
