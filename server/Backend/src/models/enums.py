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
