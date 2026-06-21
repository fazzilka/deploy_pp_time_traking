from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from sqlalchemy.pool import NullPool

from src.tasks import db as celery_db


@pytest.mark.asyncio
async def test_run_celery_db_task_uses_task_local_nullpool_engine(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engines: list[SimpleNamespace] = []
    factories: list[SimpleNamespace] = []

    def fake_create_async_engine(*_args, **kwargs):
        engine = SimpleNamespace(
            kwargs=kwargs,
            created_loop_id=id(asyncio.get_running_loop()),
            disposed=False,
            disposed_loop_id=None,
        )

        async def dispose() -> None:
            engine.disposed = True
            engine.disposed_loop_id = id(asyncio.get_running_loop())

        engine.dispose = dispose
        engines.append(engine)
        return engine

    def fake_async_sessionmaker(**kwargs):
        factory = SimpleNamespace(kwargs=kwargs)
        factories.append(factory)
        return factory

    async def handler(session_factory):
        assert session_factory is factories[0]
        return 42

    monkeypatch.setattr(celery_db, "create_async_engine", fake_create_async_engine)
    monkeypatch.setattr(celery_db, "async_sessionmaker", fake_async_sessionmaker)

    result = await celery_db.run_celery_db_task(handler)

    assert result == 42
    assert len(engines) == 1
    assert engines[0].kwargs["poolclass"] is NullPool
    assert engines[0].kwargs["pool_pre_ping"] is True
    assert engines[0].disposed is True
    assert engines[0].disposed_loop_id == engines[0].created_loop_id
    assert factories[0].kwargs["bind"] is engines[0]
    assert factories[0].kwargs["expire_on_commit"] is False


def test_run_async_celery_task_can_run_repeatedly() -> None:
    calls = 0

    async def coroutine() -> int:
        nonlocal calls
        calls += 1
        asyncio.get_running_loop()
        return calls

    assert celery_db.run_async_celery_task(coroutine) == 1
    assert celery_db.run_async_celery_task(coroutine) == 2
    assert celery_db.run_async_celery_task(coroutine) == 3
