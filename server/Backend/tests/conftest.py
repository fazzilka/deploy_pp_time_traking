from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient


class DummyResult:
    def __init__(self, *, scalar_one: Any = None, scalar_one_or_none: Any = None) -> None:
        self._scalar_one = scalar_one
        self._scalar_one_or_none = scalar_one_or_none

    def scalar_one(self) -> Any:
        return self._scalar_one

    def scalar_one_or_none(self) -> Any:
        return self._scalar_one_or_none

    def scalars(self) -> DummyResult:
        return self

    def unique(self) -> DummyResult:
        return self

    def all(self) -> list[Any]:
        return list(self._scalar_one or [])


class DummySession:
    def __init__(self) -> None:
        self.items: list[Any] = []
        self.deleted: list[Any] = []
        self.execute_results: list[DummyResult] = []
        self.get_map: dict[tuple[type[Any], int], Any] = {}
        self.committed = False

    async def execute(self, _stmt: Any) -> DummyResult:
        if self.execute_results:
            return self.execute_results.pop(0)
        return DummyResult(scalar_one=[])

    async def get(self, model: type[Any], ident: int) -> Any:
        return self.get_map.get((model, ident))

    def add(self, item: Any) -> None:
        self.items.append(item)

    async def delete(self, item: Any) -> None:
        self.deleted.append(item)

    async def commit(self) -> None:
        self.committed = True

    async def refresh(self, _item: Any) -> None:
        return None


@pytest.fixture
def dummy_session() -> DummySession:
    return DummySession()


@pytest.fixture
async def test_client() -> AsyncIterator[AsyncClient]:
    from src.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
