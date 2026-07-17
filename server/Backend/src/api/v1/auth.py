from fastapi import APIRouter, Header, Request

from src.api.deps import SessionDep
from src.core.config import settings
from src.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    RegistrationResendRequest,
    RegistrationResendResponse,
    RegistrationStartResponse,
    RegistrationVerifyRequest,
    TokenResponse,
)
from src.services.auth import login_user
from src.services.identity import normalize_email
from src.services.rate_limit import enforce_rate_limit, get_request_client_ip
from src.services.registration import (
    resend_registration_code,
    start_registration,
    verify_registration,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register/start", response_model=RegistrationStartResponse)
@router.post("/register", response_model=RegistrationStartResponse, include_in_schema=False)
async def register_start(
    payload: RegisterRequest,
    request: Request,
    session: SessionDep,
    accept_language: str = Header(default="ru"),
) -> RegistrationStartResponse:
    client_ip = get_request_client_ip(request)
    await enforce_rate_limit(
        session,
        scope="registration_start",
        identifiers=(client_ip, normalize_email(str(payload.email))),
        limit=settings.registration_start_rate_limit_per_hour,
        window_seconds=3600,
    )
    return await start_registration(session, payload, locale=accept_language)


@router.post("/register/verify", response_model=TokenResponse)
async def register_verify(
    payload: RegistrationVerifyRequest,
    request: Request,
    session: SessionDep,
) -> TokenResponse:
    client_ip = get_request_client_ip(request)
    await enforce_rate_limit(
        session,
        scope="registration_verify",
        identifiers=(client_ip, str(payload.verification_id)),
        limit=settings.registration_verify_rate_limit_per_10_minutes,
        window_seconds=600,
    )
    return await verify_registration(
        session,
        verification_id=payload.verification_id,
        code=payload.code,
    )


@router.post("/register/resend", response_model=RegistrationResendResponse)
async def register_resend(
    payload: RegistrationResendRequest,
    request: Request,
    session: SessionDep,
) -> RegistrationResendResponse:
    client_ip = get_request_client_ip(request)
    await enforce_rate_limit(
        session,
        scope="registration_resend",
        identifiers=(client_ip, str(payload.verification_id)),
        limit=settings.email_verification_max_resends + 2,
        window_seconds=3600,
    )
    return await resend_registration_code(session, verification_id=payload.verification_id)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, session: SessionDep) -> TokenResponse:
    return await login_user(session, payload)
