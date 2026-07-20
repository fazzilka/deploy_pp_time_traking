import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { GeneratedAvatar } from "../../components/GeneratedAvatar";
import { LoadingSkeleton } from "../../components/LoadingSkeleton/LoadingSkeleton";
import { ProtectedSpaceStatus } from "../../components/ProtectedSpaceStatus";
import {
  getWorkspaceMembers,
  getWorkspaceMemberSummary,
  getWorkspaceSummary,
  removeWorkspaceMember,
  updateWorkspaceMember,
} from "../../shared/api/workspaces";
import {
  createInvitation,
  getWorkspaceInvitations,
  resendInvitation,
  revokeInvitation,
} from "../../shared/api/invitations";
import type {
  WorkspaceMember,
  WorkspaceMemberStatus,
  WorkspaceInvitation,
  WorkspaceRole,
  WorkspaceSummary,
} from "../../shared/types/workspace";
import {
  canEditWorkspace,
  canManageMembers,
  useWorkspace,
} from "../../shared/workspace/WorkspaceContext";
import { formatHumanDuration } from "../../shared/utils/time";
import { invitationErrorKey } from "../../shared/utils/securityErrors";
import { useLocale } from "../../i18n";
import "./TeamPage.css";

type TeamIconName =
  | "building"
  | "users"
  | "user"
  | "folder"
  | "user-plus"
  | "gear"
  | "search"
  | "more"
  | "mail"
  | "layers"
  | "shield"
  | "activity"
  | "chevron";

type ActionMenuPosition = {
  left: number;
  top: number;
  opensUp: boolean;
};

type OpenMemberMenu = {
  member: WorkspaceMember;
  trigger: HTMLButtonElement;
  position: ActionMenuPosition;
};

const ACTION_MENU_WIDTH = 264;
const ACTION_MENU_ESTIMATED_HEIGHT = 178;
const ACTION_MENU_GAP = 10;
const ACTION_MENU_VIEWPORT_PADDING = 16;

function TeamIcon({ name }: { name: TeamIconName }) {
  const commonProps = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "building":
      return (
        <svg {...commonProps}>
          <path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16" />
          <path d="M9 21v-5h3v5" />
          <path d="M8 7h1" />
          <path d="M12 7h1" />
          <path d="M8 11h1" />
          <path d="M12 11h1" />
          <path d="M3 21h18" />
        </svg>
      );
    case "users":
      return (
        <svg {...commonProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "user":
      return (
        <svg {...commonProps}>
          <path d="M20 21a8 8 0 0 0-16 0" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "folder":
      return (
        <svg {...commonProps}>
          <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      );
    case "user-plus":
      return (
        <svg {...commonProps}>
          <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M19 8v6" />
          <path d="M22 11h-6" />
        </svg>
      );
    case "gear":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.4.5.73.9 1 .3.2.7.3 1.1.3h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.1.3c-.4.27-.7.6-.9 1Z" />
        </svg>
      );
    case "search":
      return (
        <svg {...commonProps}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "more":
      return (
        <svg {...commonProps}>
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </svg>
      );
    case "mail":
      return (
        <svg {...commonProps}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      );
    case "layers":
      return (
        <svg {...commonProps}>
          <path d="m12 2 9 5-9 5-9-5z" />
          <path d="m3 12 9 5 9-5" />
          <path d="m3 17 9 5 9-5" />
        </svg>
      );
    case "shield":
      return (
        <svg {...commonProps}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </svg>
      );
    case "activity":
      return (
        <svg {...commonProps}>
          <path d="M22 12h-4l-3 8-6-16-3 8H2" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...commonProps}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      );
    default:
      return null;
  }
}

function roleClass(role: WorkspaceRole): string {
  return `team-role team-role--${role.replace("_", "-")}`;
}

function getAvatarLetter(member: WorkspaceMember): string {
  return (
    member.user.avatar_letter ||
    member.user.full_name?.slice(0, 1).toUpperCase() ||
    member.user.username.slice(0, 1).toUpperCase() ||
    member.user.email.slice(0, 1).toUpperCase()
  );
}

function getMemberName(member: WorkspaceMember): string {
  return member.user.full_name || member.user.username || member.user.email;
}

export function TeamPage() {
  const { locale, plural, t, text } = useLocale();
  const roleLabels: Record<WorkspaceRole, string> = {
    owner: t("roles.owner"), team_lead: t("roles.team_lead"), member: t("roles.member"), viewer: t("roles.viewer"),
  };
  const roleDescriptions: Record<WorkspaceRole, string> = {
    owner: text("Полный доступ ко всем настройкам, участникам и данным.", "Full access to settings, members, and data."),
    team_lead: text("Управление проектами, задачами и участниками команды.", "Manage projects, tasks, and team members."),
    member: text("Доступ к проектам и задачам, участие в работе команды.", "Access projects and tasks and contribute to team work."),
    viewer: text("Только просмотр командных данных.", "Read-only access to team data."),
  };
  const statusLabels: Record<WorkspaceMemberStatus, string> = {
    active: text("Активен", "Active"), inactive: text("Оффлайн", "Offline"),
  };
  const {
    currentWorkspace,
    currentWorkspaceId,
    currentUserRole,
    refreshWorkspaces,
    updateCurrentWorkspace,
  } = useWorkspace();

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [workspaceSummary, setWorkspaceSummary] = useState<WorkspaceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [invitationActionId, setInvitationActionId] = useState<string | null>(null);

  const [settingsName, setSettingsName] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | WorkspaceRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | WorkspaceMemberStatus>("all");
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const [openMemberMenu, setOpenMemberMenu] = useState<OpenMemberMenu | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<WorkspaceMember | null>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);
  const [removeMemberError, setRemoveMemberError] = useState<string | null>(null);

  const canManage = canManageMembers(currentUserRole);
  const canEdit = canEditWorkspace(currentUserRole);
  const canRemoveMembers = currentUserRole === "owner" && !currentWorkspace?.is_protected;

  const membersCount = workspaceSummary?.members_count ?? currentWorkspace?.members_count ?? members.length;
  const activeMembersCount =
    workspaceSummary?.active_members_count ?? members.filter((member) => member.status === "active").length;

  const shownMembersCount = activeMembersCount || membersCount;

  const projectsCount = workspaceSummary?.projects_count ?? currentWorkspace?.projects_count ?? 0;
  const activeProjectsCount = workspaceSummary?.active_projects_count ?? projectsCount;

  const tasksCount = workspaceSummary?.tasks_count ?? currentWorkspace?.tasks_count ?? 0;
  const completedTasksCount = workspaceSummary?.completed_tasks_count ?? 0;
  const totalTimeSeconds = workspaceSummary?.total_time_seconds ?? currentWorkspace?.total_time_seconds ?? 0;

  function canRemoveMember(member: WorkspaceMember): boolean {
    return (
      canRemoveMembers
      && member.role !== "owner"
      && member.user.id !== currentWorkspace?.owner_id
    );
  }

  async function loadTeam() {
    if (!currentWorkspaceId) {
      setMembers([]);
      setWorkspaceSummary(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [nextMembers, memberSummary, nextWorkspaceSummary, nextInvitations] = await Promise.all([
        getWorkspaceMembers(currentWorkspaceId),
        getWorkspaceMemberSummary(currentWorkspaceId),
        getWorkspaceSummary(currentWorkspaceId),
        canManage ? getWorkspaceInvitations(currentWorkspaceId) : Promise.resolve([]),
      ]);

      const summaryByUser = new Map(memberSummary.items.map((item) => [item.user.id, item]));

      setMembers(
        nextMembers.map((member) => ({
          ...member,
          ...(summaryByUser.get(member.user.id) ?? {}),
        })),
      );

      setWorkspaceSummary(nextWorkspaceSummary);
      setInvitations(nextInvitations.filter((item) => item.status === "pending"));
    } catch {
      setError(text("Не удалось загрузить команду", "Could not load team"));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTeam();
  }, [currentWorkspaceId]);

  useEffect(() => {
    setSettingsName(currentWorkspace?.name ?? "");
    setSettingsDescription(currentWorkspace?.description ?? "");
    setSettingsError(null);
  }, [currentWorkspace]);

  useEffect(() => {
    if (!openMemberMenu) {
      return;
    }

    const menuTrigger = openMemberMenu.trigger;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (actionMenuRef.current?.contains(target) || menuTrigger.contains(target)) {
        return;
      }

      setOpenMemberMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMemberMenu(null);
      }
    }

    function handleViewportChange() {
      setOpenMemberMenu(null);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [openMemberMenu]);

  const filteredMembers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return members.filter((member) => {
      const matchesSearch =
        !normalizedSearch ||
        member.user.email.toLowerCase().includes(normalizedSearch) ||
        member.user.username.toLowerCase().includes(normalizedSearch) ||
        member.user.full_name?.toLowerCase().includes(normalizedSearch);

      const matchesRole = roleFilter === "all" || member.role === roleFilter;
      const matchesStatus = statusFilter === "all" || member.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [members, roleFilter, search, statusFilter]);

  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentWorkspaceId) {
      return;
    }

    setInviteError(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setInviteError(text("Введите email участника", "Enter the member's email"));
      return;
    }

    try {
      setIsSendingInvite(true);
      await createInvitation(currentWorkspaceId, {
        email: email.trim(),
        role,
      });

      setEmail("");
      setRole("member");
      setIsInviteOpen(false);
      setSuccessMessage(t("invitations.sent"));

      await loadTeam();
    } catch (caughtError) {
      setInviteError(t(invitationErrorKey(caughtError)));
    } finally {
      setIsSendingInvite(false);
    }
  }

  async function handleInvitationAction(invitation: WorkspaceInvitation, action: "resend" | "revoke") {
    if (!currentWorkspaceId || invitationActionId) return;
    setInvitationActionId(invitation.id);
    setSuccessMessage(null);
    try {
      if (action === "resend") {
        await resendInvitation(currentWorkspaceId, invitation.id);
        setSuccessMessage(t("invitations.resent"));
      } else {
        await revokeInvitation(currentWorkspaceId, invitation.id);
        setSuccessMessage(t("invitations.revoked"));
      }
      await loadTeam();
    } catch (caughtError) {
      setError(t(invitationErrorKey(caughtError)));
    } finally {
      setInvitationActionId(null);
    }
  }

  function openSettings() {
    setSettingsName(currentWorkspace?.name ?? "");
    setSettingsDescription(currentWorkspace?.description ?? "");
    setSettingsError(null);
    setIsSettingsOpen(true);
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSettingsError(null);
    setSuccessMessage(null);

    if (!canEdit) {
      setSettingsError(text("У вас нет прав на изменение настроек.", "You do not have permission to change settings."));
      return;
    }

    if (!settingsName.trim()) {
      setSettingsError(text("Введите название workspace", "Enter a workspace name"));
      return;
    }

    try {
      setIsSavingSettings(true);

      await updateCurrentWorkspace({
        name: settingsName.trim(),
        description: settingsDescription.trim() || null,
      });

      setSuccessMessage(text("Настройки команды сохранены", "Team settings saved"));
      setIsSettingsOpen(false);

      await Promise.all([loadTeam(), refreshWorkspaces()]);
    } catch (caughtError) {
      setSettingsError(caughtError instanceof Error ? caughtError.message : text("Не удалось сохранить настройки", "Could not save settings"));
    } finally {
      setIsSavingSettings(false);
    }
  }

  function getActionMenuPosition(trigger: HTMLButtonElement): ActionMenuPosition {
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const canOpenUp = rect.top >= ACTION_MENU_ESTIMATED_HEIGHT + ACTION_MENU_GAP + ACTION_MENU_VIEWPORT_PADDING;
    const opensUp =
      rect.bottom + ACTION_MENU_GAP + ACTION_MENU_ESTIMATED_HEIGHT + ACTION_MENU_VIEWPORT_PADDING > viewportHeight &&
      canOpenUp;

    const left = Math.min(
      Math.max(rect.right - ACTION_MENU_WIDTH, ACTION_MENU_VIEWPORT_PADDING),
      viewportWidth - ACTION_MENU_WIDTH - ACTION_MENU_VIEWPORT_PADDING,
    );

    return {
      left,
      top: opensUp ? rect.top - ACTION_MENU_GAP : rect.bottom + ACTION_MENU_GAP,
      opensUp,
    };
  }

  function toggleMemberMenu(member: WorkspaceMember, trigger: HTMLButtonElement) {
    setOpenMemberMenu((currentMenu) => {
      if (currentMenu?.member.id === member.id) {
        return null;
      }

      return {
        member,
        trigger,
        position: getActionMenuPosition(trigger),
      };
    });
  }

  async function handleRoleChange(member: WorkspaceMember, nextRole: WorkspaceRole) {
    if (!currentWorkspaceId || member.role === nextRole) {
      setOpenMemberMenu(null);
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      await updateWorkspaceMember(currentWorkspaceId, member.id, {
        role: nextRole,
      });

      setSuccessMessage(text(`Роль участника ${getMemberName(member)} обновлена.`, `${getMemberName(member)}'s role was updated.`));
      await loadTeam();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : text("Не удалось изменить роль участника", "Could not change member role"));
    } finally {
      setOpenMemberMenu(null);
    }
  }

  function handleRemoveMember(member: WorkspaceMember) {
    if (!canRemoveMember(member) || isRemovingMember) {
      return;
    }
    setOpenMemberMenu(null);
    setRemoveMemberError(null);
    setMemberToRemove(member);
  }

  function closeRemoveMemberDialog() {
    if (isRemovingMember) {
      return;
    }
    setRemoveMemberError(null);
    setMemberToRemove(null);
  }

  async function confirmRemoveMember() {
    if (!currentWorkspaceId || !memberToRemove || isRemovingMember) {
      return;
    }

    setRemoveMemberError(null);
    setSuccessMessage(null);

    try {
      setIsRemovingMember(true);
      await removeWorkspaceMember(currentWorkspaceId, memberToRemove.id);
      setMembers((currentMembers) => currentMembers.filter((member) => member.id !== memberToRemove.id));
      await Promise.all([loadTeam(), refreshWorkspaces()]);
      setSuccessMessage(
        t("workspaceMembers.removeDialog.success", {
          memberName: getMemberName(memberToRemove),
          workspaceName: currentWorkspace?.name ?? "",
        }),
      );
      setMemberToRemove(null);
    } catch {
      setRemoveMemberError(t("workspaceMembers.removeDialog.error"));
    } finally {
      setIsRemovingMember(false);
    }
  }

  return (
    <>
      <main className="team-page">
      <section className="team-hero">
        <div className="team-hero__copy">
          <p className="team-hero__eyebrow">{text("Командная работа", "Team workspace")}</p>
          <h1 className="team-hero__title">{t("team.title")}</h1>
          <p className="team-hero__text">
            {text("Управляйте участниками, ролями и рабочим пространством в одном месте.", "Manage members, roles, and the workspace in one place.")}
          </p>
        </div>

        <div className="team-hero__actions">
          <button
            className="team-action team-action--primary"
            type="button"
            onClick={() => setIsInviteOpen(true)}
            disabled={!canManage}
          >
            <TeamIcon name="user-plus" />
            {text("Пригласить участника", "Invite member")}
          </button>

          <button className="team-action team-action--secondary" type="button" onClick={openSettings}>
            <TeamIcon name="gear" />
            {text("Настройки команды", "Team settings")}
          </button>
        </div>
      </section>

      <ProtectedSpaceStatus />

      {error && <div className="status-message status-message--error team-page__status">{error}</div>}
      {successMessage && <div className="team-page__notice">{successMessage}</div>}

      <section className="team-stats-grid" aria-label={text("Сводка команды", "Team summary")}>
        <article className="team-stat">
          <span className="team-stat__icon">
            <TeamIcon name="building" />
          </span>

          <div className="team-stat__content">
            <p>{text("Организация", "Organization")}</p>
            <h2>{currentWorkspace?.name ?? text("Рабочее пространство", "Workspace")}</h2>
          </div>
        </article>

        <article className="team-stat">
          <span className="team-stat__icon">
            <TeamIcon name="users" />
          </span>

          <div className="team-stat__content">
            <p>{t("team.title")}</p>
            <h2>{text("Основная команда", "Core team")}</h2>
          </div>
        </article>

        <article className="team-stat">
          <span className="team-stat__icon">
            <TeamIcon name="user" />
          </span>

          <div className="team-stat__content">
            <p>{text("Участников", "Members")}</p>
            <h2>
              {membersCount} <small>{plural("team.summary.activeMembers", activeMembersCount)}</small>
            </h2>
          </div>
        </article>

        <article className="team-stat">
          <span className="team-stat__icon">
            <TeamIcon name="folder" />
          </span>

          <div className="team-stat__content">
            <p>{text("Всего проектов", "Total projects")}</p>
            <h2>
              {projectsCount} <small>{plural("team.summary.activeProjects", activeProjectsCount)}</small>
            </h2>
          </div>
        </article>
      </section>

      <section className="team-layout">
        <section className="team-members-card">
          <header className="team-card-heading">
            <h2>{text("Участники", "Members")}</h2>
          </header>

          <div className="team-filters">
            <label className="team-search">
              <TeamIcon name="search" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={text("Поиск по участникам", "Search members")}
              />
            </label>

            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as "all" | WorkspaceRole)}
            >
              <option value="all">{text("Все роли", "All roles")}</option>
              <option value="owner">{roleLabels.owner}</option>
              <option value="team_lead">{roleLabels.team_lead}</option>
              <option value="member">{roleLabels.member}</option>
              <option value="viewer">{roleLabels.viewer}</option>
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | WorkspaceMemberStatus)}
            >
              <option value="all">{text("Все участники", "All members")}</option>
              <option value="active">{text("Активные", "Active")}</option>
              <option value="inactive">{text("Оффлайн", "Offline")}</option>
            </select>
          </div>

          {isLoading ? (
            <LoadingSkeleton label={text("Загружаем участников...", "Loading members...")} variant="list" />
          ) : (
            <div className="team-table content-reveal" role="table" aria-label={text("Участники workspace", "Workspace members")}>
              <div className="team-table__head" role="row">
                <span>{text("Участник", "Member")}</span><span>{text("Роль", "Role")}</span><span>{text("Статус", "Status")}</span>
                <span>{t("projects.title")}</span><span>{t("tasks.queue.title")}</span><span>{text("Время", "Time")}</span><span>{text("Действия", "Actions")}</span>
              </div>

              {filteredMembers.map((member) => (
                <div className="team-table__row" role="row" key={member.id}>
                  <div className="team-member">
                    <span className="team-member__avatar-wrap">
                      <GeneratedAvatar
                        seed={
                          member.user.avatar_seed ??
                          member.user.email ??
                          member.user.username ??
                          member.user.id ??
                          getAvatarLetter(member)
                        }
                        letter={getAvatarLetter(member)}
                        size={38}
                        title={getMemberName(member)}
                      />
                      <i className={`team-member__dot team-member__dot--${member.status}`} />
                    </span>

                    <div className="team-member__info">
                      <strong>{getMemberName(member)}</strong>
                      <em>{member.user.email}</em>
                    </div>
                  </div>

                  <span className={roleClass(member.role)}>{roleLabels[member.role]}</span>

                  <span className={`team-status team-status--${member.status}`}>
                    <i />
                    {statusLabels[member.status]}
                  </span>

                  <span className="team-number">{member.projects_count ?? 0}</span>
                  <span className="team-number">{member.tasks_count ?? 0}</span>
                  <span className="team-time">{formatHumanDuration(member.total_time_seconds ?? 0, locale)}</span>

                  <div className="team-row-actions">
                    {canManage && member.role !== "owner" ? (
                      <button
                        type="button"
                        className={
                          openMemberMenu?.member.id === member.id
                            ? "team-row-actions__button team-row-actions__button--active"
                            : "team-row-actions__button"
                        }
                        aria-label={text(`Действия ${member.user.email}`, `Actions for ${member.user.email}`)}
                        aria-expanded={openMemberMenu?.member.id === member.id}
                        onClick={(event) => toggleMemberMenu(member, event.currentTarget)}
                      >
                        <TeamIcon name="more" />
                      </button>
                    ) : (
                      <button type="button" className="team-row-actions__button" disabled aria-label={text("Нет действий", "No actions")}>
                        <TeamIcon name="more" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {filteredMembers.length === 0 && <div className="team-empty-state">{text("Участники не найдены.", "No members found.")}</div>}
            </div>
          )}

          <footer className="team-members-footer">
            <span>
              {plural("team.members.showing", filteredMembers.length, {
                shown: filteredMembers.length,
                total: members.length,
              })}
            </span>

            <div className="team-pagination" aria-label={text("Пагинация участников", "Member pagination")}>
              <button type="button" disabled>
                ‹
              </button>
              <strong>1</strong>
              <button type="button" disabled>
                ›
              </button>
            </div>
          </footer>
        </section>

        <aside className="team-sidebar">
          <section className="team-side-card">
            <div className="team-side-card__title">
              <TeamIcon name="layers" />
              <h2>{text("Структура", "Structure")}</h2>
            </div>

            <div className="team-structure">
              <article>
                <span>
                  <TeamIcon name="building" />
                </span>

                <div>
                  <p>{text("Организация", "Organization")}</p>
                  <strong>{currentWorkspace?.name ?? text("Рабочее пространство", "Workspace")}</strong>
                </div>
              </article>

              <article>
                <span>
                  <TeamIcon name="users" />
                </span>

                <div>
                  <p>{t("team.title")}</p>
                  <strong>{text("Основная команда", "Core team")}</strong>
                </div>
              </article>

              <article>
                <span>
                  <TeamIcon name="user" />
                </span>

                <div>
                  <p>{text("Участники", "Members")}</p>
                  <strong>{plural("navigation.workspace.members", shownMembersCount)}</strong>
                </div>
              </article>
            </div>
          </section>

          <section className="team-side-card team-side-card--roles">
            <div className="team-side-card__title team-side-card__title--split">
              <span>
                <TeamIcon name="shield" />
                <h2>{text("Роли", "Roles")}</h2>
              </span>

              <button type="button">{text("Подробнее о ролях", "About roles")}</button>
            </div>

            <div className="team-roles">
              {(["owner", "team_lead", "member", "viewer"] as WorkspaceRole[]).map((item) => (
                <article key={item}>
                  <span className={roleClass(item)}>{roleLabels[item]}</span>
                  <p>{roleDescriptions[item]}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="team-side-card">
            <div className="team-workload">
              <h2 className="team-workload__title">
                <TeamIcon name="activity" />
                {t("team.sections.workload")}
              </h2>

              <div className="team-workload__stats">
                <div className="team-workload__stat">
                  <strong>{tasksCount}</strong>
                  <span>{text("задач всего", "total tasks")}</span>
                </div>

                <div className="team-workload__stat">
                  <strong>{completedTasksCount}</strong>
                  <span>{text("завершено", "completed")}</span>
                </div>

                <div className="team-workload__stat">
                  <strong>{formatHumanDuration(totalTimeSeconds, locale)}</strong>
                  <span>{text("учтено времени", "tracked time")}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="team-side-card">
            <div className="team-side-card__title">
              <TeamIcon name="mail" />
              <h2>
                {t("team.sections.invitations")} <small>{invitations.length}</small>
              </h2>
            </div>

            <div className="team-invites-list">
              {invitations.length === 0 ? <div className="team-invite-empty">
                <strong>{t("invitations.emptyTitle")}</strong>
                <p>{t("invitations.emptyDescription")}</p>
              </div> : invitations.map((invitation) => (
                <article className="team-invite-item" key={invitation.id}>
                  <strong>{invitation.invited_email}</strong>
                  <span>{roleLabels[invitation.role]} · {new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium" }).format(new Date(invitation.expires_at))}</span>
                  <div><button type="button" disabled={Boolean(invitationActionId)} onClick={() => void handleInvitationAction(invitation, "resend")}>{t("invitations.resend")}</button><button type="button" disabled={Boolean(invitationActionId)} onClick={() => void handleInvitationAction(invitation, "revoke")}>{t("invitations.revoke")}</button></div>
                </article>
              ))}
            </div>

            <button
              className="team-action team-action--primary team-action--wide"
              type="button"
              onClick={() => setIsInviteOpen(true)}
              disabled={!canManage}
            >
              <TeamIcon name="user-plus" />
              {t("invitations.send")}
            </button>
          </section>

          <section className="team-side-card">
            <div className="team-side-card__title">
              <TeamIcon name="activity" />
              <h2>{text("Активность команды", "Team activity")}</h2>
            </div>

            <div className="team-activity-empty">
              <span />
              <p>{text("Активность появится после действий участников.", "Activity will appear after members start working.")}</p>
            </div>
          </section>
        </aside>
      </section>

      {isInviteOpen && (
        <div className="team-modal-backdrop" role="presentation" onClick={() => setIsInviteOpen(false)}>
          <form className="team-modal" onSubmit={handleAddMember} onClick={(event) => event.stopPropagation()}>
            <div className="team-modal__header">
              <span>
                <TeamIcon name="user-plus" />
              </span>

              <div>
                <h2>{t("invitations.title")}</h2>
                <p>
                  {t("invitations.emailDescription")}
                </p>
              </div>
            </div>

            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="user@example.com"
              />
            </label>

            <label>
              <span>{text("Роль", "Role")}</span>
              <select value={role} onChange={(event) => setRole(event.target.value as WorkspaceRole)}>
                <option value="member">{roleLabels.member}</option>
                <option value="team_lead">{roleLabels.team_lead}</option>
                <option value="viewer">{roleLabels.viewer}</option>
              </select>
            </label>

            {inviteError && <p className="team-modal__error">{inviteError}</p>}

            <div className="team-modal__actions">
              <button className="team-action team-action--primary" type="submit" disabled={isSendingInvite}>
                {t(isSendingInvite ? "invitations.sending" : "invitations.send")}
              </button>

              <button className="team-action team-action--secondary" type="button" onClick={() => setIsInviteOpen(false)}>
                {t("common.actions.cancel")}
              </button>
            </div>
          </form>
        </div>
      )}

      {isSettingsOpen && (
        <div className="team-modal-backdrop" role="presentation" onClick={() => setIsSettingsOpen(false)}>
          <form className="team-modal" onSubmit={handleSaveSettings} onClick={(event) => event.stopPropagation()}>
            <div className="team-modal__header">
              <span>
                <TeamIcon name="gear" />
              </span>

              <div>
                <h2>{text("Настройки команды", "Team settings")}</h2>
                <p>{currentWorkspace?.name ?? text("Рабочее пространство", "Workspace")}</p>
              </div>
            </div>

            {!canEdit && <p className="team-modal__warning">{text("У вас нет прав на изменение настроек.", "You do not have permission to change these settings.")}</p>}

            <label>
              <span>{text("Название", "Name")}</span>
              <input
                value={settingsName}
                onChange={(event) => setSettingsName(event.target.value)}
                disabled={!canEdit || isSavingSettings}
              />
            </label>

            <label>
              <span>{text("Описание", "Description")}</span>
              <textarea
                value={settingsDescription}
                onChange={(event) => setSettingsDescription(event.target.value)}
                disabled={!canEdit || isSavingSettings}
              />
            </label>

            <div className="team-settings-summary">
              <span>
                <em>{text("Тип workspace", "Workspace type")}</em>
                <strong>{currentWorkspace?.type === "team" ? text("Организация", "Organization") : text("Личное", "Personal")}</strong>
              </span>

              <span>
                <em>{text("Моя роль", "My role")}</em>
                <strong>{currentUserRole ? roleLabels[currentUserRole] : t("roles.viewer")}</strong>
              </span>

              <span>
                <em>{text("Участников", "Members")}</em>
                <strong>{membersCount}</strong>
              </span>

              <span>
                <em>{text("Проектов", "Projects")}</em>
                <strong>{projectsCount}</strong>
              </span>
            </div>

            <div className="team-danger-zone">
              <strong>{text("Архивация организации", "Archive organization")}</strong>
              <p>{text("Будет добавлена отдельной безопасной операцией позже.", "This will be added later as a separate safe operation.")}</p>
            </div>

            {settingsError && <p className="team-modal__error">{settingsError}</p>}

            <div className="team-modal__actions">
              <button className="team-action team-action--primary" type="submit" disabled={!canEdit || isSavingSettings}>
                {t(isSavingSettings ? "common.actions.saving" : "common.actions.save")}
              </button>

              <button className="team-action team-action--secondary" type="button" onClick={() => setIsSettingsOpen(false)}>
                {t("common.actions.cancel")}
              </button>
            </div>
          </form>
        </div>
      )}
      </main>

      {openMemberMenu && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={actionMenuRef}
              className={
                openMemberMenu.position.opensUp
                  ? "team-row-actions__menu team-row-actions__menu--portal team-row-actions__menu--opens-up"
                  : "team-row-actions__menu team-row-actions__menu--portal"
              }
              style={{
                left: openMemberMenu.position.left,
                top: openMemberMenu.position.top,
              }}
              role="dialog"
              aria-label={text(`Действия для ${openMemberMenu.member.user.email}`, `Actions for ${openMemberMenu.member.user.email}`)}
            >
              <label>
                <span>{text("Роль", "Role")}</span>
                <select
                  value={openMemberMenu.member.role}
                  onChange={(event) =>
                    void handleRoleChange(openMemberMenu.member, event.target.value as WorkspaceRole)
                  }
                >
                  <option value="team_lead">{roleLabels.team_lead}</option>
                  <option value="member">{roleLabels.member}</option>
                  <option value="viewer">{roleLabels.viewer}</option>
                </select>
              </label>

              {canRemoveMember(openMemberMenu.member) ? (
                <button type="button" onClick={() => handleRemoveMember(openMemberMenu.member)}>
                  {t("workspaceMembers.removeAction")}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
      <ConfirmDialog
        open={memberToRemove !== null}
        title={t("workspaceMembers.removeDialog.title")}
        description={memberToRemove ? t("workspaceMembers.removeDialog.description", {
          memberName: getMemberName(memberToRemove),
          workspaceName: currentWorkspace?.name ?? "",
        }) : ""}
        detail={memberToRemove ? t("workspaceMembers.removeDialog.member", {
          memberName: memberToRemove.user.email,
        }) : undefined}
        confirmLabel={t(isRemovingMember ? "workspaceMembers.removeDialog.removing" : "workspaceMembers.removeDialog.confirm")}
        cancelLabel={t("workspaceMembers.removeDialog.cancel")}
        isLoading={isRemovingMember}
        destructive
        error={removeMemberError}
        onConfirm={confirmRemoveMember}
        onCancel={closeRemoveMemberDialog}
      />
    </>
  );
}
