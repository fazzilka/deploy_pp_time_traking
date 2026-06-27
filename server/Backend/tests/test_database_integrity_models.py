from sqlalchemy import Table

from src.models.notification import Notification, NotificationDelivery
from src.models.project import Project
from src.models.protected_space import ProtectedSpaceSession, ProtectedSpaceSettings
from src.models.task import Task
from src.models.time_interval import TimeInterval
from src.models.user import User
from src.models.workspace import Workspace, WorkspaceMember


def _constraint_names(table: Table) -> set[str]:
    return {constraint.name for constraint in table.constraints if constraint.name}


def _index_names(table: Table) -> set[str]:
    return {index.name for index in table.indexes if index.name}


def test_user_model_has_role_check_constraint() -> None:
    assert "ck_users_role_allowed" in _constraint_names(User.__table__)


def test_workspace_models_have_integrity_constraints_and_indexes() -> None:
    assert "ck_workspaces_type_allowed" in _constraint_names(Workspace.__table__)

    member_constraints = _constraint_names(WorkspaceMember.__table__)
    assert "ck_workspace_members_role_allowed" in member_constraints
    assert "ck_workspace_members_status_allowed" in member_constraints
    assert "ix_workspace_members_workspace_id_role_status" in _index_names(
        WorkspaceMember.__table__,
    )


def test_project_model_rejects_blank_names() -> None:
    assert "ck_projects_name_not_blank" in _constraint_names(Project.__table__)


def test_task_model_has_time_and_priority_constraints() -> None:
    task_constraints = _constraint_names(Task.__table__)
    assert "ck_tasks_total_time_non_negative" in task_constraints
    assert "ck_tasks_priority_allowed" in task_constraints


def test_time_interval_model_has_duration_constraint_and_user_finished_index() -> None:
    assert "ck_time_intervals_finished_after_started" in _constraint_names(
        TimeInterval.__table__,
    )
    assert "ix_time_intervals_user_id_finished_at" in _index_names(
        TimeInterval.__table__,
    )


def test_notification_models_have_type_read_and_delivery_constraints() -> None:
    notification_constraints = _constraint_names(Notification.__table__)
    assert "ck_notifications_type_allowed" in notification_constraints
    assert "ck_notifications_unread_without_read_at" in notification_constraints

    delivery_constraints = _constraint_names(NotificationDelivery.__table__)
    assert "ck_notification_deliveries_channel_allowed" in delivery_constraints
    assert "ck_notification_deliveries_status_allowed" in delivery_constraints
    assert "ck_notification_deliveries_attempts_non_negative" in delivery_constraints


def test_protected_space_models_have_integrity_constraints_and_indexes() -> None:
    settings_constraints = _constraint_names(ProtectedSpaceSettings.__table__)
    assert "uq_protected_settings_user_id" in settings_constraints
    assert "uq_protected_settings_workspace_id" in settings_constraints
    assert "ck_protected_settings_failed_attempts" in settings_constraints

    session_constraints = _constraint_names(ProtectedSpaceSession.__table__)
    assert "ck_protected_sessions_expires_after_create" in session_constraints
    assert "ix_protected_sessions_user_workspace" in _index_names(
        ProtectedSpaceSession.__table__,
    )
