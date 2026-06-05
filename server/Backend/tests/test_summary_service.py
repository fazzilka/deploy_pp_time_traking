from __future__ import annotations

import pytest

from src.services.summary import build_summary


class SimpleResult:
    def __init__(self, *, one=None, rows=None):
        self._one = one
        self._rows = rows or []

    def one(self):
        return self._one

    def all(self):
        return list(self._rows)


class DummySession:
    def __init__(self) -> None:
        self.execute_results = [
            SimpleResult(one=(120, 2)),
            SimpleResult(
                rows=[
                    (1, "Первая", "Описание", 100, None, "high"),
                    (2, "Вторая", "", 20, None, "medium"),
                ],
            ),
        ]
        self.execute_count = 0

    async def execute(self, _stmt):
        self.execute_count += 1
        return self.execute_results.pop(0)


@pytest.mark.asyncio
async def test_build_summary_returns_total_and_top_tasks() -> None:
    session = DummySession()
    summary = await build_summary(session, user_id=1, limit=10)

    assert summary.total_time_seconds_all_tasks == 120
    assert summary.tasks_with_time_count == 2
    assert len(summary.top_tasks) == 2
    assert summary.top_tasks[0].id == 1
    assert session.execute_count == 2
