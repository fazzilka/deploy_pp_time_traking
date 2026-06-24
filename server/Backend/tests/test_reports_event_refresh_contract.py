from __future__ import annotations

from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[2]
REPORTS_PAGE = SERVER_ROOT / "frontend" / "src" / "pages" / "ReportsPage" / "ReportsPage.tsx"
REPORTS_API = SERVER_ROOT / "frontend" / "src" / "shared" / "api" / "reports.ts"
WORKSPACE_CONTEXT = (
    SERVER_ROOT / "frontend" / "src" / "shared" / "workspace" / "WorkspaceContext.tsx"
)


def test_reports_page_does_not_poll_or_fetch_on_mount() -> None:
    source = REPORTS_PAGE.read_text(encoding="utf-8")

    assert "setInterval" not in source
    assert "setTimeout" not in source
    assert "getReportsData" not in source
    assert "ensureReportsLoaded" not in source
    assert "USER_EVENT_RECEIVED_EVENT" not in source
    assert "useSyncExternalStore" in source
    assert "getReportsSnapshot" in source


def test_reports_cache_owns_initial_load_and_event_refresh() -> None:
    source = REPORTS_API.read_text(encoding="utf-8")

    assert "reportsCache" in source
    assert "subscribeToReportsCache" in source
    assert "ensureReportsLoaded" in source
    assert "handleReportsEvent" in source
    assert "scheduleReportsRefreshForWorkspace" in source
    assert "REPORTS_REFRESH_DEBOUNCE_MS = 400" in source


def test_workspace_context_bootstraps_reports_and_handles_user_events() -> None:
    source = WORKSPACE_CONTEXT.read_text(encoding="utf-8")

    assert "ensureReportsLoaded(currentWorkspace.id)" in source
    assert "handleReportsEvent(event, payload, currentWorkspaceIdRef.current)" in source
    assert "USER_EVENTS_STATUS_EVENT" in source
    assert "scheduleReportsRefreshForWorkspace(currentWorkspaceIdRef.current)" in source
