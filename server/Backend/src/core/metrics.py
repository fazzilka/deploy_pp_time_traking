from __future__ import annotations

import re
from time import perf_counter
from typing import Any

from prometheus_client import Counter, Histogram
from sqlalchemy import event
from sqlalchemy.engine import Engine

DB_QUERY_DURATION = Histogram(
    "db_query_duration_seconds",
    "Database query duration in seconds.",
    labelnames=("operation", "database"),
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)
DB_QUERIES = Counter(
    "db_queries_total",
    "Total number of database queries.",
    labelnames=("operation", "database"),
)
DB_QUERY_ERRORS = Counter(
    "db_query_errors_total",
    "Total number of failed database queries.",
    labelnames=("operation", "database"),
)

_DATABASE_LABEL = "postgres"
_CONFIGURED_ENGINE_IDS: set[int] = set()
_OPERATION_PATTERN = re.compile(r"^\s*(?:/\*.*?\*/\s*)*([a-zA-Z]+)", re.DOTALL)


def configure_db_metrics(engine: Engine) -> None:
    engine_id = id(engine)
    if engine_id in _CONFIGURED_ENGINE_IDS:
        return

    event.listen(engine, "before_cursor_execute", _before_cursor_execute)
    event.listen(engine, "after_cursor_execute", _after_cursor_execute)
    event.listen(engine, "handle_error", _handle_error)
    _CONFIGURED_ENGINE_IDS.add(engine_id)


def _before_cursor_execute(
    _conn: Any,
    _cursor: Any,
    statement: str,
    _parameters: Any,
    context: Any,
    _executemany: bool,
) -> None:
    context._time_tracking_started_at = perf_counter()
    context._time_tracking_operation = _extract_operation(statement)


def _after_cursor_execute(
    _conn: Any,
    _cursor: Any,
    statement: str,
    _parameters: Any,
    context: Any,
    _executemany: bool,
) -> None:
    operation = _get_context_operation(context, statement)
    started_at = getattr(context, "_time_tracking_started_at", None)
    if isinstance(started_at, float):
        DB_QUERY_DURATION.labels(operation=operation, database=_DATABASE_LABEL).observe(
            max(perf_counter() - started_at, 0.0)
        )
    DB_QUERIES.labels(operation=operation, database=_DATABASE_LABEL).inc()


def _handle_error(exception_context: Any) -> None:
    context = getattr(exception_context, "execution_context", None)
    statement = getattr(exception_context, "statement", "") or ""
    operation = _get_context_operation(context, statement)
    started_at = getattr(context, "_time_tracking_started_at", None)

    if isinstance(started_at, float):
        DB_QUERY_DURATION.labels(operation=operation, database=_DATABASE_LABEL).observe(
            max(perf_counter() - started_at, 0.0)
        )
    DB_QUERIES.labels(operation=operation, database=_DATABASE_LABEL).inc()
    DB_QUERY_ERRORS.labels(operation=operation, database=_DATABASE_LABEL).inc()


def _get_context_operation(context: Any, statement: str) -> str:
    operation = getattr(context, "_time_tracking_operation", None)
    if isinstance(operation, str):
        return operation
    return _extract_operation(statement)


def _extract_operation(statement: str) -> str:
    match = _OPERATION_PATTERN.match(statement)
    if not match:
        return "OTHER"

    operation = match.group(1).upper()
    if operation in {"SELECT", "INSERT", "UPDATE", "DELETE"}:
        return operation
    if operation == "WITH":
        return "SELECT"
    return "OTHER"
