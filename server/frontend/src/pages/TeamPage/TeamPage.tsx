import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GeneratedAvatar } from "../../components/GeneratedAvatar";
import {
  addWorkspaceMember,
  getWorkspaceMembers,
  getWorkspaceMemberSummary,
  getWorkspaceSummary,
  removeWorkspaceMember,
  updateWorkspaceMember,
} from "../../shared/api/workspaces";
import type {
  WorkspaceMember,
  WorkspaceMemberStatus,
  WorkspaceRole,
  WorkspaceSummary,
} from "../../shared/types/workspace";
import {
  canEditWorkspace,
  canManageMembers,
  useWorkspace,
} from "../../shared/workspace/WorkspaceContext";
import {
  WORKSPACE_MEMBERSHIP_CHANGED_EVENT,
  type WorkspaceMembershipChangedPayload,
} from "../../shared/events/userEvents";
import { formatHumanDuration } from "../../shared/utils/time";
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

const roleLabels: Record<WorkspaceRole, string> = {
  owner: "Owner",
  team_lead: "Team Lead",
  member: "Member",
  viewer: "Viewer",
};

const roleDescriptions: Record<WorkspaceRole, string> = {
  owner: "Полный доступ ко всем настройкам, участникам и данным.",
  team_lead: "Управление проектами, задачами и участниками команды.",
  member: "Доступ к проектам и задачам, участие в работе команды.",
  viewer: "Только просмотр командных данных.",
};

const statusLabels: Record<WorkspaceMemberStatus, string> = {
  active: "Активен",
  inactive: "Оффлайн",
};

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
  const {
    currentWorkspace,
    currentWorkspaceId,
    currentUserRole,
    refreshWorkspaces,
    updateCurrentWorkspace,
  } = useWorkspace();

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [workspaceSummary, setWorkspaceSummary] = useState<WorkspaceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  const [settingsName, setSettingsName] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | WorkspaceRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | WorkspaceMemberStatus>("all");

  const canManage = canManageMembers(currentUserRole);
  const canEdit = canEditWorkspace(currentUserRole);

  const membersCount = workspaceSummary?.members_count ?? currentWorkspace?.members_count ?? members.length;
  const activeMembersCount =
    workspaceSummary?.active_members_count ?? members.filter((member) => member.status === "active").length;

  const shownMembersCount = activeMembersCount || membersCount;

  const projectsCount = workspaceSummary?.projects_count ?? currentWorkspace?.projects_count ?? 0;
  const activeProjectsCount = workspaceSummary?.active_projects_count ?? projectsCount;

  const tasksCount = workspaceSummary?.tasks_count ?? currentWorkspace?.tasks_count ?? 0;
  const completedTasksCount = workspaceSummary?.completed_tasks_count ?? 0;
  const totalTimeSeconds = workspaceSummary?.total_time_seconds ?? currentWorkspace?.total_time_seconds ?? 0;

  const updateMemberCounts = useCallback((delta: number) => {
    setWorkspaceSummary((currentSummary) => {
      if (!currentSummary) {
        return currentSummary;
      }
      const membersCount = Math.max(0, currentSummary.members_count + delta);
      const activeMembersCount = Math.max(0, currentSummary.active_members_count + delta);
      return {
        ...currentSummary,
        members_count: membersCount,
        active_members_count: activeMembersCount,
        workspace: {
          ...currentSummary.workspace,
          members_count: membersCount,
        },
      };
    });
  }, []);

  const loadTeam = useCallback(async () => {
    if (!currentWorkspaceId) {
      setMembers([]);
      setWorkspaceSummary(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [nextMembers, memberSummary, nextWorkspaceSummary] = await Promise.all([
        getWorkspaceMembers(currentWorkspaceId),
        getWorkspaceMemberSummary(currentWorkspaceId),
        getWorkspaceSummary(currentWorkspaceId),
      ]);

      const summaryByUser = new Map(memberSummary.items.map((item) => [item.user.id, item]));

      setMembers(
        nextMembers.map((member) => ({
          ...member,
          ...(summaryByUser.get(member.user.id) ?? {}),
        })),
      );

      setWorkspaceSummary(nextWorkspaceSummary);
    } catch {
      setError("Не удалось загрузить команду");
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspaceId]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  useEffect(() => {
    function handleWorkspaceMembershipChanged(event: Event) {
      const detail = (event as CustomEvent<WorkspaceMembershipChangedPayload>).detail;
      if (detail.workspace_id !== currentWorkspaceId) {
        return;
      }

      if (detail.reason === "removed") {
        setMembers([]);
        setWorkspaceSummary(null);
        return;
      }

      void loadTeam();
    }

    window.addEventListener(WORKSPACE_MEMBERSHIP_CHANGED_EVENT, handleWorkspaceMembershipChanged);
    return () => window.removeEventListener(WORKSPACE_MEMBERSHIP_CHANGED_EVENT, handleWorkspaceMembershipChanged);
  }, [currentWorkspaceId, loadTeam]);

  useEffect(() => {
    setSettingsName(currentWorkspace?.name ?? "");
    setSettingsDescription(currentWorkspace?.description ?? "");
    setSettingsError(null);
  }, [currentWorkspace]);

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
      setInviteError("Введите email участника");
      return;
    }

    try {
      setIsInviting(true);
      const addedMember = await addWorkspaceMember(currentWorkspaceId, {
        email: email.trim(),
        role,
      });

      setMembers((currentMembers) => {
        if (currentMembers.some((member) => member.id === addedMember.id)) {
          return currentMembers;
        }
        return [
          ...currentMembers,
          {
            ...addedMember,
            projects_count: addedMember.projects_count ?? 0,
            tasks_count: addedMember.tasks_count ?? 0,
            completed_tasks_count: addedMember.completed_tasks_count ?? 0,
            total_time_seconds: addedMember.total_time_seconds ?? 0,
          },
        ];
      });
      updateMemberCounts(1);
      setEmail("");
      setRole("member");
      setIsInviteOpen(false);
      setSuccessMessage("Участник добавлен. Workspace появится у него автоматически.");
      void refreshWorkspaces({ silent: true });
    } catch (caughtError) {
      setInviteError(caughtError instanceof Error ? caughtError.message : "Не удалось добавить участника");
    } finally {
      setIsInviting(false);
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
      setSettingsError("У вас нет прав на изменение настроек.");
      return;
    }

    if (!settingsName.trim()) {
      setSettingsError("Введите название workspace");
      return;
    }

    try {
      setIsSavingSettings(true);

      const updatedWorkspace = await updateCurrentWorkspace({
        name: settingsName.trim(),
        description: settingsDescription.trim() || null,
      });
      if (updatedWorkspace) {
        setWorkspaceSummary((currentSummary) =>
          currentSummary ? { ...currentSummary, workspace: updatedWorkspace } : currentSummary,
        );
      }

      setSuccessMessage("Настройки команды сохранены");
      setIsSettingsOpen(false);
      void refreshWorkspaces({ silent: true });
    } catch (caughtError) {
      setSettingsError(caughtError instanceof Error ? caughtError.message : "Не удалось сохранить настройки");
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleRoleChange(member: WorkspaceMember, nextRole: WorkspaceRole) {
    if (!currentWorkspaceId || member.role === nextRole) {
      return;
    }

    const previousMembers = members;
    setMembers((currentMembers) =>
      currentMembers.map((currentMember) =>
        currentMember.id === member.id ? { ...currentMember, role: nextRole } : currentMember,
      ),
    );

    try {
      const updatedMember = await updateWorkspaceMember(currentWorkspaceId, member.id, {
        role: nextRole,
      });
      setMembers((currentMembers) =>
        currentMembers.map((currentMember) =>
          currentMember.id === updatedMember.id ? { ...currentMember, ...updatedMember } : currentMember,
        ),
      );
      void refreshWorkspaces({ silent: true });
    } catch (caughtError) {
      setMembers(previousMembers);
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось изменить роль участника");
    }
  }

  async function handleRemoveMember(member: WorkspaceMember) {
    if (!currentWorkspaceId) {
      return;
    }

    const confirmed = window.confirm(`Удалить ${member.user.email} из команды?`);

    if (!confirmed) {
      return;
    }

    const previousMembers = members;
    const previousSummary = workspaceSummary;
    setMembers((currentMembers) => currentMembers.filter((currentMember) => currentMember.id !== member.id));
    updateMemberCounts(-1);

    try {
      await removeWorkspaceMember(currentWorkspaceId, member.id);
      void refreshWorkspaces({ silent: true });
    } catch (caughtError) {
      setMembers(previousMembers);
      setWorkspaceSummary(previousSummary);
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось удалить участника");
    }
  }

  return (
    <main className="team-page">
      <section className="team-hero">
        <div className="team-hero__copy">
          <p className="team-hero__eyebrow">Командная работа</p>
          <h1 className="team-hero__title">Команда</h1>
          <p className="team-hero__text">
            Управляйте участниками, ролями и рабочим пространством в одном месте.
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
            Пригласить участника
          </button>

          <button className="team-action team-action--secondary" type="button" onClick={openSettings}>
            <TeamIcon name="gear" />
            Настройки команды
          </button>
        </div>
      </section>

      {error && <div className="status-message status-message--error team-page__status">{error}</div>}
      {successMessage && <div className="team-page__notice">{successMessage}</div>}

      <section className="team-stats-grid" aria-label="Сводка команды">
        <article className="team-stat">
          <span className="team-stat__icon">
            <TeamIcon name="building" />
          </span>

          <div className="team-stat__content">
            <p>Организация</p>
            <h2>{currentWorkspace?.name ?? "Workspace"}</h2>
          </div>
        </article>

        <article className="team-stat">
          <span className="team-stat__icon">
            <TeamIcon name="users" />
          </span>

          <div className="team-stat__content">
            <p>Команда</p>
            <h2>Основная команда</h2>
          </div>
        </article>

        <article className="team-stat">
          <span className="team-stat__icon">
            <TeamIcon name="user" />
          </span>

          <div className="team-stat__content">
            <p>Участников</p>
            <h2>
              {membersCount} <small>{activeMembersCount} активных</small>
            </h2>
          </div>
        </article>

        <article className="team-stat">
          <span className="team-stat__icon">
            <TeamIcon name="folder" />
          </span>

          <div className="team-stat__content">
            <p>Всего проектов</p>
            <h2>
              {projectsCount} <small>{activeProjectsCount} активных</small>
            </h2>
          </div>
        </article>
      </section>

      <section className="team-layout">
        <section className="team-members-card">
          <header className="team-card-heading">
            <h2>Участники</h2>
          </header>

          <div className="team-filters">
            <label className="team-search">
              <TeamIcon name="search" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск по участникам"
              />
            </label>

            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as "all" | WorkspaceRole)}
            >
              <option value="all">Все роли</option>
              <option value="owner">Owner</option>
              <option value="team_lead">Team Lead</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | WorkspaceMemberStatus)}
            >
              <option value="all">Все участники</option>
              <option value="active">Активные</option>
              <option value="inactive">Оффлайн</option>
            </select>
          </div>

          {isLoading ? (
            <div className="team-empty-state">Загружаем участников...</div>
          ) : (
            <div className="team-table" role="table" aria-label="Участники workspace">
              <div className="team-table__head" role="row">
                <span>Участник</span>
                <span>Роль</span>
                <span>Статус</span>
                <span>Проекты</span>
                <span>Задачи</span>
                <span>Время</span>
                <span>Действия</span>
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
                  <span className="team-time">{formatHumanDuration(member.total_time_seconds ?? 0)}</span>

                  <div className="team-row-actions">
                    {canManage && member.role !== "owner" ? (
                      <details>
                        <summary aria-label={`Действия ${member.user.email}`}>
                          <TeamIcon name="more" />
                        </summary>

                        <div className="team-row-actions__menu">
                          <label>
                            Роль
                            <select
                              value={member.role}
                              onChange={(event) => void handleRoleChange(member, event.target.value as WorkspaceRole)}
                            >
                              <option value="team_lead">Team Lead</option>
                              <option value="member">Member</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          </label>

                          <button type="button" onClick={() => void handleRemoveMember(member)}>
                            Удалить из команды
                          </button>
                        </div>
                      </details>
                    ) : (
                      <button type="button" className="team-row-actions__button" disabled aria-label="Нет действий">
                        <TeamIcon name="more" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {filteredMembers.length === 0 && <div className="team-empty-state">Участники не найдены.</div>}
            </div>
          )}

          <footer className="team-members-footer">
            <span>
              Показано {filteredMembers.length} из {members.length} участников
            </span>

            <div className="team-pagination" aria-label="Пагинация участников">
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
              <h2>Структура</h2>
            </div>

            <div className="team-structure">
              <article>
                <span>
                  <TeamIcon name="building" />
                </span>

                <div>
                  <p>Организация</p>
                  <strong>{currentWorkspace?.name ?? "Workspace"}</strong>
                </div>
              </article>

              <article>
                <span>
                  <TeamIcon name="users" />
                </span>

                <div>
                  <p>Команда</p>
                  <strong>Основная команда</strong>
                </div>
              </article>

              <article>
                <span>
                  <TeamIcon name="user" />
                </span>

                <div>
                  <p>Участники</p>
                  <strong>{shownMembersCount} участников</strong>
                </div>
              </article>
            </div>
          </section>

          <section className="team-side-card team-side-card--roles">
            <div className="team-side-card__title team-side-card__title--split">
              <span>
                <TeamIcon name="shield" />
                <h2>Роли</h2>
              </span>

              <button type="button">Подробнее о ролях</button>
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
                Рабочая нагрузка
              </h2>

              <div className="team-workload__stats">
                <div className="team-workload__stat">
                  <strong>{tasksCount}</strong>
                  <span>задач всего</span>
                </div>

                <div className="team-workload__stat">
                  <strong>{completedTasksCount}</strong>
                  <span>завершено</span>
                </div>

                <div className="team-workload__stat">
                  <strong>{formatHumanDuration(totalTimeSeconds)}</strong>
                  <span>учтено времени</span>
                </div>
              </div>
            </div>
          </section>

          <section className="team-side-card">
            <div className="team-side-card__title">
              <TeamIcon name="mail" />
              <h2>
                Приглашения <small>0</small>
              </h2>
            </div>

            <div className="team-invites-list">
              <div className="team-invite-empty">
                <strong>Активных приглашений нет</strong>
                <p>Добавляйте участников по email. Пользователь должен быть уже зарегистрирован.</p>
              </div>
            </div>

            <button
              className="team-action team-action--primary team-action--wide"
              type="button"
              onClick={() => setIsInviteOpen(true)}
              disabled={!canManage}
            >
              <TeamIcon name="user-plus" />
              Добавить участника
            </button>
          </section>

          <section className="team-side-card">
            <div className="team-side-card__title">
              <TeamIcon name="activity" />
              <h2>Активность команды</h2>
            </div>

            <div className="team-activity-empty">
              <span />
              <p>Активность появится после действий участников.</p>
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
                <h2>Добавить участника</h2>
                <p>
                  Пользователь должен быть уже зарегистрирован. После добавления организация появится у него в
                  workspace switcher.
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
              <span>Роль</span>
              <select value={role} onChange={(event) => setRole(event.target.value as WorkspaceRole)}>
                <option value="member">Member</option>
                <option value="team_lead">Team Lead</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>

            {inviteError && <p className="team-modal__error">{inviteError}</p>}

            <div className="team-modal__actions">
              <button className="team-action team-action--primary" type="submit" disabled={isInviting}>
                {isInviting ? "Добавляем..." : "Добавить"}
              </button>

              <button className="team-action team-action--secondary" type="button" onClick={() => setIsInviteOpen(false)}>
                Отмена
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
                <h2>Настройки команды</h2>
                <p>{currentWorkspace?.name ?? "Workspace"}</p>
              </div>
            </div>

            {!canEdit && <p className="team-modal__warning">У вас нет прав на изменение настроек.</p>}

            <label>
              <span>Название</span>
              <input
                value={settingsName}
                onChange={(event) => setSettingsName(event.target.value)}
                disabled={!canEdit || isSavingSettings}
              />
            </label>

            <label>
              <span>Описание</span>
              <textarea
                value={settingsDescription}
                onChange={(event) => setSettingsDescription(event.target.value)}
                disabled={!canEdit || isSavingSettings}
              />
            </label>

            <div className="team-settings-summary">
              <span>
                <em>Тип workspace</em>
                <strong>{currentWorkspace?.type === "team" ? "Organization" : "Personal"}</strong>
              </span>

              <span>
                <em>Моя роль</em>
                <strong>{currentUserRole ? roleLabels[currentUserRole] : "Viewer"}</strong>
              </span>

              <span>
                <em>Участников</em>
                <strong>{membersCount}</strong>
              </span>

              <span>
                <em>Проектов</em>
                <strong>{projectsCount}</strong>
              </span>
            </div>

            <div className="team-danger-zone">
              <strong>Архивация организации</strong>
              <p>Будет добавлена отдельной безопасной операцией позже.</p>
            </div>

            {settingsError && <p className="team-modal__error">{settingsError}</p>}

            <div className="team-modal__actions">
              <button className="team-action team-action--primary" type="submit" disabled={!canEdit || isSavingSettings}>
                {isSavingSettings ? "Сохраняем..." : "Сохранить"}
              </button>

              <button className="team-action team-action--secondary" type="button" onClick={() => setIsSettingsOpen(false)}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
