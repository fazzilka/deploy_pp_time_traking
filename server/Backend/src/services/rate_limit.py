from __future__ import annotations

import hashlib
import hmac
import ipaddress
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy import case
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.models.registration import RateLimitBucket


def get_request_client_ip(request: Request) -> str:
    direct_ip = request.client.host if request.client else "unknown"
    if not settings.trusted_proxy_headers:
        return direct_ip
    forwarded_ip = request.headers.get("X-Real-IP", "").strip()
    try:
        return str(ipaddress.ip_address(forwarded_ip))
    except ValueError:
        return direct_ip


async def enforce_rate_limit(
    session: AsyncSession,
    *,
    scope: str,
    identifiers: tuple[str, ...],
    limit: int,
    window_seconds: int,
) -> None:
    if limit <= 0:
        return
    now = datetime.now(UTC)
    expires_at = now + timedelta(seconds=window_seconds)
    raw_key = f"{scope}:{':'.join(identifiers)}".encode()
    key_hash = hmac.new(settings.jwt_secret_key.encode(), raw_key, hashlib.sha256).hexdigest()
    table = RateLimitBucket.__table__
    insert_statement = insert(RateLimitBucket).values(
        key_hash=key_hash,
        count=1,
        window_started_at=now,
        expires_at=expires_at,
    )
    statement = insert_statement.on_conflict_do_update(
        index_elements=[table.c.key_hash],
        set_={
            "count": case((table.c.expires_at <= now, 1), else_=table.c.count + 1),
            "window_started_at": case(
                (table.c.expires_at <= now, now), else_=table.c.window_started_at
            ),
            "expires_at": case((table.c.expires_at <= now, expires_at), else_=table.c.expires_at),
        },
    ).returning(table.c.count, table.c.expires_at)
    result = await session.execute(statement)
    count, bucket_expires_at = result.one()
    await session.commit()
    if int(count) > limit:
        retry_after = max(1, int((bucket_expires_at - now).total_seconds()))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много запросов. Повторите позже.",
            headers={"Retry-After": str(retry_after)},
        )
