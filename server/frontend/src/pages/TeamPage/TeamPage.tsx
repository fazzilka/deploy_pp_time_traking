import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addWorkspaceMember,
  getWorkspaceMembers,
  getWorkspaceMemberSummary,
  removeWorkspaceMember,
  updateWorkspaceMember,
} from "../../shared/api/workspaces";
import type { WorkspaceMember, WorkspaceRole } from "../../shared/types/workspace";
import { canEditWorkspace, canManageMembers, useWorkspace } from "../../shared/workspace/WorkspaceContext";
import { formatHumanDuration } from "../../shared/utils/time";
import "./TeamPage.css";

const roleLabels: Record<WorkspaceRole, string> = {
  owner: "Owner",
  team_lead: "Team Lead",
  member: "Member",
  viewer: "Viewer",
};

const roleDescriptions: Record<WorkspaceRole, string> = {
  owner: "Полный доступ к workspace, участникам, проектам и задачам.",
  team_lead: "Управляет задачами, проектами и может добавлять участников.",
  member: "Работает с задачами и таймерами внутри workspace.",
  viewer: "Только просматривает командные проекты и отчёты.",
};

function roleClass(role: WorkspaceRole): string {
  return `team-role team-role--${role.replace("_", "-")}`;
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

  const canManage = canManageMembers(currentUserRole);
  const canEdit = canEditWorkspace(currentUserRole);

  async function loadTeam() {
    if (!currentWorkspaceId) {
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
      return matchesSearch && matchesRole;
    });
  }, [members, roleFilter, search]);

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
    <main className="team-page app-container">
      <section className="team-hero">
        <div>
          <p className="eyebrow">Командная работа</p>
          <h1 className="page-heading">Команда</h1>
          <p className="page-copy">Управляйте участниками, ролями и рабочим пространством в одном месте.</p>
        </div>
        <div className="team-hero__actions">
          <button className="button button--green" type="button" onClick={() => setIsInviteOpen(true)} disabled={!canManage}>
            Пригласить участника
          </button>
          <button className="button" type="button" disabled={!canEdit}>
            Настройки команды
          </button>
        </div>
      </section>

      {error && <div className="status-message status-message--error team-status">{error}</div>}

      <section className="team-stats" aria-label="Сводка workspace">
        <article>
          <span>Организация</span>
          <strong>{currentWorkspace?.name ?? "Workspace"}</strong>
          <em>{currentWorkspace?.type === "team" ? "Team workspace" : "Personal workspace"}</em>
        </article>
        <article>
          <span>Команда</span>
          <strong>Основная команда</strong>
          <em>{roleLabels[currentUserRole ?? "viewer"]}</em>
        </article>
        <article>
          <span>Участников</span>
          <strong>{currentWorkspace?.members_count ?? members.length}</strong>
          <em>активных участников</em>
        </article>
        <article>
          <span>Всего проектов</span>
          <strong>{currentWorkspace?.projects_count ?? 0}</strong>
          <em>в текущем workspace</em>
        </article>
      </section>

      <section className="team-layout">
        <section className="team-card team-members">
          <div className="team-card__header">
            <div>
              <h2>Участники</h2>
              <p>Роли, загрузка и вклад в рабочее пространство.</p>
            </div>
          </div>
          <div className="team-members__toolbar">
            <input
              className="text-field"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск участника"
            />
            <select className="text-field" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | WorkspaceRole)}>
              <option value="all">Все роли</option>
              <option value="owner">Owner</option>
              <option value="team_lead">Team Lead</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          {isLoading ? (
            <div className="status-message">Загружаем участников...</div>
          ) : (
            <div className="team-members__table">
              <div className="team-members__row team-members__row--head">
                <span>Участник</span>
                <span>Роль</span>
                <span>Статус</span>
                <span>Проекты</span>
                <span>Задачи</span>
                <span>Время</span>
                <span>Действия</span>
              </div>
              {filteredMembers.map((member) => (
                <div className="team-members__row" key={member.id}>
                  <div className="team-member">
                    <span className="team-member__avatar">{member.user.avatar_letter}</span>
                    <div>
                      <strong>{member.user.full_name || member.user.username}</strong>
                      <em>{member.user.email}</em>
                    </div>
                  </div>
                  <span className={roleClass(member.role)}>{roleLabels[member.role]}</span>
                  <span className="team-status-pill">{member.status === "active" ? "Активен" : "Неактивен"}</span>
                  <span>{member.projects_count}</span>
                  <span>{member.tasks_count}</span>
                  <span>{formatHumanDuration(member.total_time_seconds)}</span>
                  <div className="team-members__actions">
                    {canManage && member.role !== "owner" ? (
                      <>
                        <select
                          value={member.role}
                          onChange={(event) => void handleRoleChange(member, event.target.value as WorkspaceRole)}
                          aria-label={`Роль ${member.user.email}`}
                        >
                          <option value="team_lead">Team Lead</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button type="button" onClick={() => void handleRemoveMember(member)}>
                          Удалить
                        </button>
                      </>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="team-side">
          <section className="team-card">
            <h2>Структура</h2>
            <div className="team-tree">
              <span>{currentWorkspace?.name ?? "Workspace"}</span>
              <strong>Основная команда</strong>
              <em>{members.length} участников</em>
            </div>
          </section>

          <section className="team-card">
            <h2>Роли</h2>
            {(["owner", "team_lead", "member", "viewer"] as WorkspaceRole[]).map((item) => (
              <div className="team-role-line" key={item}>
                <span className={roleClass(item)}>{roleLabels[item]}</span>
                <p>{roleDescriptions[item]}</p>
              </div>
            ))}
          </section>

          <section className="team-card">
            <h2>Добавление участников</h2>
            <p>Добавляйте участников по email, если они уже зарегистрированы.</p>
            <button className="button button--green" type="button" onClick={() => setIsInviteOpen(true)} disabled={!canManage}>
              Добавить участника
            </button>
          </section>

          <section className="team-card">
            <h2>Активность команды</h2>
            <div className="status-message">Активность появится после действий участников.</div>
          </section>
        </aside>
      </section>

      {isInviteOpen && (
        <div className="team-modal-backdrop" role="presentation" onClick={() => setIsInviteOpen(false)}>
          <form className="team-modal" onSubmit={handleAddMember} onClick={(event) => event.stopPropagation()}>
            <h2>Добавить участника</h2>
            <label>
              <span>Email</span>
              <input
                className="text-field"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="user@example.com"
              />
            </label>
            <label>
              <span>Роль</span>
              <select className="text-field" value={role} onChange={(event) => setRole(event.target.value as WorkspaceRole)}>
                <option value="member">Member</option>
                <option value="team_lead">Team Lead</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            {inviteError && <p className="team-modal__error">{inviteError}</p>}
            <div className="team-modal__actions">
              <button className="button button--green" type="submit">
                Добавить
              </button>
              <button className="button" type="button" onClick={() => setIsInviteOpen(false)}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
