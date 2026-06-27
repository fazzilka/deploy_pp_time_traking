from contextvars import ContextVar

_vault_token_context: ContextVar[str | None] = ContextVar("vault_token", default=None)


def set_request_vault_token(token: str | None) -> object:
    return _vault_token_context.set(token)


def reset_request_vault_token(token: object) -> None:
    _vault_token_context.reset(token)  # type: ignore[arg-type]


def get_request_vault_token() -> str | None:
    return _vault_token_context.get()
