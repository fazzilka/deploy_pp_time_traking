from pydantic import BaseModel, ConfigDict, Field

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
    intervals: list[TimeIntervalRead] = []
