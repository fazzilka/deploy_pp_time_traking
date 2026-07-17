from pathlib import Path
from runpy import run_path
from typing import Any


def test_email_defaults_migration_only_changes_defaults(monkeypatch) -> None:
    migration = run_path(
        Path(__file__).parents[1] / "alembic" / "versions" / "0019_email_defaults_for_new_users.py"
    )
    calls: list[tuple[str, str, dict[str, Any]]] = []

    def alter_column(table_name: str, column_name: str, **kwargs: Any) -> None:
        calls.append((table_name, column_name, kwargs))

    def reject_data_update(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("existing users must not be updated")

    monkeypatch.setattr(migration["op"], "alter_column", alter_column)
    monkeypatch.setattr(migration["op"], "execute", reject_data_update)
    migration["upgrade"]()

    assert [column_name for _, column_name, _ in calls] == list(
        migration["EMAIL_PREFERENCE_COLUMNS"]
    )
    assert all(table_name == "users" for table_name, _, _ in calls)
    assert all(str(kwargs["server_default"]) == "true" for _, _, kwargs in calls)

    calls.clear()
    migration["downgrade"]()
    assert all(str(kwargs["server_default"]) == "false" for _, _, kwargs in calls)
