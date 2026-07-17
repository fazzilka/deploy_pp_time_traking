from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from src.schemas.user import PASSWORD_MIN_LENGTH, UserProfileBase


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfileBase


class RegistrationStartResponse(BaseModel):
    verification_id: UUID
    email_masked: str
    expires_in_seconds: int
    resend_available_in_seconds: int


class RegistrationVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    verification_id: UUID
    code: str = Field(min_length=6, max_length=6)

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        if not value.isascii() or not value.isdigit():
            raise ValueError("Код должен содержать 6 цифр")
        return value


class RegistrationResendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    verification_id: UUID


class RegistrationResendResponse(BaseModel):
    expires_in_seconds: int
    resend_available_in_seconds: int
