from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_COMMENT_BODY_LENGTH = 5000


class TaskCommentAuthor(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    avatar_url: str | None = None
    avatar_letter: str = ""
    avatar_seed: str | None = None


class TaskCommentCreate(BaseModel):
    body: str = Field(max_length=MAX_COMMENT_BODY_LENGTH)

    @field_validator("body")
    @classmethod
    def validate_body(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Комментарий не может быть пустым")
        if len(value) > MAX_COMMENT_BODY_LENGTH:
            raise ValueError("Комментарий не может быть длиннее 5000 символов")
        return value


class TaskCommentUpdate(TaskCommentCreate):
    pass


class TaskCommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    workspace_id: int
    author: TaskCommentAuthor
    body: str | None
    created_at: datetime
    updated_at: datetime | None = None
    deleted_at: datetime | None = None
    is_deleted: bool
    can_edit: bool
    can_delete: bool

    @model_validator(mode="before")
    @classmethod
    def hide_deleted_body(cls, data: Any) -> Any:
        if isinstance(data, dict) and data.get("is_deleted"):
            return {**data, "body": None}
        return data


class TaskCommentsPage(BaseModel):
    items: list[TaskCommentRead]
    total_active: int
    limit: int
    next_cursor: str | None = None
