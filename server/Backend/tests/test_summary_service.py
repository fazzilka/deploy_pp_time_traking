from __future__ import annotations

from types import SimpleNamespace

import pytest

from src.services.summary import build_summary


class SimpleResult:
    def __init__(self, scalar_one):
        self._scalar_one = scalar_one

    def scalar_one(self):
        return self._scalar_one

    def scalars(self):
        return self

    def unique(self):
        return self

    def all(self):
        return list(self._scalar_one)


class DummySession:
    def __init__(self) -> None:
        self.execute_results = [
            SimpleResult(120),
            SimpleResult(
                [
                    SimpleNamespace(id=1, total_time_seconds=100),
                    SimpleNamespace(id=2, total_time_seconds=20),
                ]
            ),
        ]

    async def execute(self, _stmt):
        return self.execute_results.pop(0)


@pytest.mark.asyncio
async def test_build_summary_returns_total_and_top_tasks() -> None:
    total, tasks = await build_summary(DummySession(), limit=10)

    assert total == 120
    assert len(tasks) == 2
    assert tasks[0].id == 1
