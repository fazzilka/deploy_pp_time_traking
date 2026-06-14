import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addWorkspaceMember,
  getWorkspaceMembers,
  getWorkspaceMemberSummary,
  removeWorkspaceMember,
  updateWorkspaceMember,
} from "../../shared/api/workspaces";
import type { WorkspaceMember, WorkspaceMemberStatus, WorkspaceRole } from "../../shared/types/workspace";
import { canEditWorkspace, canManageMembers, useWorkspace } from "../../shared/workspace/WorkspaceContext";
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
  | "activity";

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
  inactive: "Отключён",
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
          <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
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

export function TeamPage() {
  const { currentWorkspace, currentWorkspaceId, currentUserRole, refreshWorkspaces } = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | WorkspaceRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | WorkspaceMemberStatus>("all");

  const canManage = canManageMembers(currentUserRole);
  const canEdit = canEditWorkspace(currentUserRole);
  const membersCount = currentWorkspace?.members_count ?? members.length;
  const activeMembersCount = members.filter((member) => member.status === "active").length;

  async function loadTeam() {
    if (!currentWorkspaceId) {
      setMembers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [nextMembers, summary] = await Promise.all([
        getWorkspaceMembers(currentWorkspaceId),
        getWorkspaceMemberSummary(currentWorkspaceId),
      ]);
      const summaryByUser = new Map(summary.items.map((item) => [item.user.id, item]));
      setMembers(
        nextMembers.map((member) => ({
          ...member,
          ...(summaryByUser.get(member.user.id) ?? {}),
        })),
      );
    } catch {
      setError("Не удалось загрузить команду");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTeam();
  }, [currentWorkspaceId]);

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
    if (!email.trim()) {
      setInviteError("Введите email участника");
      return;
    }

    try {
      await addWorkspaceMember(currentWorkspaceId, { email: email.trim(), role });
      setEmail("");
      setRole("member");
      setIsInviteOpen(false);
      await Promise.all([loadTeam(), refreshWorkspaces()]);
    } catch (caughtError) {
      setInviteError(caughtError instanceof Error ? caughtError.message : "Не удалось добавить участника");
    }
  }

  async function handleRoleChange(member: WorkspaceMember, nextRole: WorkspaceRole) {
    if (!currentWorkspaceId || member.role === nextRole) {
      return;
    }
    await updateWorkspaceMember(currentWorkspaceId, member.id, { role: nextRole });
    await loadTeam();
  }

  async function handleRemoveMember(member: WorkspaceMember) {
    if (!currentWorkspaceId) {
      return;
    }
    const confirmed = window.confirm(`Удалить ${member.user.email} из команды?`);
    if (!confirmed) {
      return;
    }
    await removeWorkspaceMember(currentWorkspaceId, member.id);
    await Promise.all([loadTeam(), refreshWorkspaces()]);
  }

  return (
    <main className="team-page">
      <section className="team-page__hero">
        <div className="team-page__hero-copy">
          <p className="team-page__eyebrow">Командная работа</p>
          <h1 className="team-page__title">Команда</h1>
          <p className="team-page__subtitle">
            Управляйте участниками, ролями и рабочим пространством в одном месте.
          </p>
        </div>
        <div className="team-page__actions">
          <button
            className="team-button team-button--primary"
            type="button"
            onClick={() => setIsInviteOpen(true)}
            disabled={!canManage}
          >
            <TeamIcon name="user-plus" />
            Пригласить участника
          </button>
          <button className="team-button team-button--secondary" type="button" disabled={!canEdit}>
            <TeamIcon name="gear" />
            Настройки команды
          </button>
        </div>
      </section>

      {error && <div className="status-message status-message--error team-page__status">{error}</div>}

      <section className="team-overview-grid" aria-label="Сводка workspace">
        <article className="team-stat-card">
          <span className="team-stat-card__icon">
            <TeamIcon name="building" />
          </span>
          <div>
            <p>Организация</p>
            <h2>{currentWorkspace?.name ?? "Workspace"}</h2>
            <span>{currentWorkspace?.type === "team" ? "Team workspace" : "Personal workspace"}</span>
          </div>
        </article>
        <article className="team-stat-card">
          <span className="team-stat-card__icon">
            <TeamIcon name="users" />
          </span>
          <div>
            <p>Команда</p>
            <h2>Основная команда</h2>
            <span>{roleLabels[currentUserRole ?? "viewer"]}</span>
          </div>
        </article>
        <article className="team-stat-card">
          <span className="team-stat-card__icon">
            <TeamIcon name="user" />
          </span>
          <div>
            <p>Участников</p>
            <h2>{membersCount}</h2>
            <span>{activeMembersCount || membersCount} активных участников</span>
          </div>
        </article>
        <article className="team-stat-card">
          <span className="team-stat-card__icon">
            <TeamIcon name="folder" />
          </span>
          <div>
            <p>Всего проектов</p>
            <h2>{currentWorkspace?.projects_count ?? 0}</h2>
            <span>{currentWorkspace?.tasks_count ?? 0} задач в работе</span>
          </div>
        </article>
      </section>

      <section className="team-page__content">
        <section className="team-members-card">
          <div className="team-members-card__header">
            <div>
              <h2>Участники</h2>
              <p>Роли, статус и вклад участников в текущее рабочее пространство.</p>
            </div>
            <span>{filteredMembers.length} / {members.length}</span>
          </div>

          <div className="team-members-card__filters">
            <label className="team-search-field">
              <TeamIcon name="search" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск по участникам"
              />
            </label>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | WorkspaceRole)}>
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
              <option value="inactive">Отключённые</option>
            </select>
          </div>

          {isLoading ? (
            <div className="team-empty-state">Загружаем участников...</div>
          ) : (
            <div className="team-members-table" role="table" aria-label="Участники workspace">
              <div className="team-members-table__head" role="row">
                <span>Участник</span>
                <span>Роль</span>
                <span>Статус</span>
                <span>Проекты</span>
                <span>Задачи</span>
                <span>Время</span>
                <span>Действия</span>
              </div>
              {filteredMembers.map((member) => (
                <div className="team-members-table__row" role="row" key={member.id}>
                  <div className="team-member-cell">
                    <span className="team-member-cell__avatar">
                      {getAvatarLetter(member)}
                      <i className={`team-member-cell__presence team-member-cell__presence--${member.status}`} />
                    </span>
                    <div>
                      <strong>{member.user.full_name || member.user.username}</strong>
                      <em>{member.user.email}</em>
                    </div>
                  </div>
                  <span className={roleClass(member.role)}>{roleLabels[member.role]}</span>
                  <span className={`team-status team-status--${member.status}`}>
                    <i />
                    {statusLabels[member.status]}
                  </span>
                  <span className="team-table-number">{member.projects_count ?? 0}</span>
                  <span className="team-table-number">{member.tasks_count ?? 0}</span>
                  <span className="team-table-time">{formatHumanDuration(member.total_time_seconds ?? 0)}</span>
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

          <footer className="team-members-card__footer">
            <span>Показано {filteredMembers.length} из {members.length} участников</span>
            <div className="team-pagination" aria-label="Пагинация участников">
              <button type="button" disabled>
                &lt;
              </button>
              <strong>1</strong>
              <button type="button" disabled>
                &gt;
              </button>
            </div>
          </footer>
        </section>

        <aside className="team-side-panel">
          <section className="team-side-card team-side-card--structure">
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
                  <strong>{membersCount} участников</strong>
                </div>
              </article>
            </div>
          </section>

          <section className="team-side-card">
            <div className="team-side-card__title team-side-card__title--split">
              <span>
                <TeamIcon name="shield" />
                <h2>Роли</h2>
              </span>
              <button type="button">Подробнее о ролях</button>
            </div>
            <div className="team-roles-list">
              {(["owner", "team_lead", "member", "viewer"] as WorkspaceRole[]).map((item) => (
                <article key={item}>
                  <span className={roleClass(item)}>{roleLabels[item]}</span>
                  <p>{roleDescriptions[item]}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="team-side-card">
            <div className="team-side-card__title">
              <TeamIcon name="mail" />
              <h2>Приглашения</h2>
            </div>
            <div className="team-invites">
              <span>0</span>
              <div>
                <strong>Активных приглашений нет</strong>
                <p>Добавляйте участников по email. Пользователь должен быть уже зарегистрирован.</p>
              </div>
            </div>
            <button
              className="team-button team-button--primary team-button--wide"
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
                <p>Введите email зарегистрированного пользователя.</p>
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
              <button className="team-button team-button--primary" type="submit">
                Добавить
              </button>
              <button className="team-button team-button--secondary" type="button" onClick={() => setIsInviteOpen(false)}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
