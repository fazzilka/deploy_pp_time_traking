from enum import StrEnum


class UserRole(StrEnum):
    USER = "user"
    ADMIN = "admin"


class TaskPriority(StrEnum):
    LOWEST = "lowest"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    HIGHEST = "highest"


class WorkspaceType(StrEnum):
    PERSONAL = "personal"
    TEAM = "team"


class WorkspaceRole(StrEnum):
    OWNER = "owner"
    TEAM_LEAD = "team_lead"
    MEMBER = "member"
    VIEWER = "viewer"


class WorkspaceMemberStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class NotificationType(StrEnum):
    DEADLINE_SOON = "deadline_soon"
    DEADLINE_OVERDUE = "deadline_overdue"
    WORKSPACE_MEMBER_ADDED = "workspace_member_added"
    WORKSPACE_MEMBER_REMOVED = "workspace_member_removed"
    WORKSPACE_MEMBER_ROLE_CHANGED = "workspace_member_role_changed"
    WORKSPACE_ROLE_CHANGED = "workspace_role_changed"


class NotificationDeliveryChannel(StrEnum):
    EMAIL = "email"
    TELEGRAM = "telegram"


class NotificationDeliveryStatus(StrEnum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    SKIPPED = "skipped"
