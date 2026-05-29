from pydantic import BaseModel, ConfigDict


class SummaryTask(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    total_time_seconds: int


class SummaryResponse(BaseModel):
    total_time_seconds_all_tasks: int
    top_tasks: list[SummaryTask]
