from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class ProtectedSpacePasswordMixin(BaseModel):
    @field_validator("password", "new_password", check_fields=False)
    @classmethod
    def strip_password_edges(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 12:
            raise ValueError("Защитный пароль должен быть не короче 12 символов")
        return value


class ProtectedSpaceCreate(ProtectedSpacePasswordMixin):
    password: str = Field(min_length=12, max_length=1024)


class ProtectedSpaceUnlock(BaseModel):
    password: str = Field(min_length=1, max_length=1024)


class ProtectedSpaceChangePassword(ProtectedSpacePasswordMixin):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=12, max_length=1024)


class ProtectedSpaceStatus(BaseModel):
    exists: bool
    workspace_id: int | None = None
    is_unlocked: bool = False
    expires_at: datetime | None = None


class ProtectedSpaceRead(BaseModel):
    workspace_id: int
    name: str
    is_enabled: bool
    created_at: datetime


class ProtectedSpaceUnlockResponse(BaseModel):
    workspace_id: int
    vault_token: str
    expires_at: datetime


class ProtectedSpaceMessage(BaseModel):
    detail: str
