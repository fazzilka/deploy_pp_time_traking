import type { FormEvent, KeyboardEvent} from "react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ProjectIcon,
  ProjectIconPicker,
  getProjectFallbackIcon,
  type ProjectIconName,
} from "../../components/ProjectIcon/ProjectIcon";
import { ProtectedSpaceStatus } from "../../components/ProtectedSpaceStatus";
import {
  createProject,
  ensureProjectsLoaded,
  getProjectsTimeSummary,
} from "../../shared/api/projects";
import type {
  ProjectListItem,
  ProjectsTimeSummaryResponse,
} from "../../shared/types/project";
import { canCreateProjects, useWorkspace } from "../../shared/workspace/WorkspaceContext";
import { formatHumanDuration } from "../../shared/utils/time";
import "./ProjectsPage.css";

const PROJECT_COLORS = [
  "#8957e5",
  "#2ea043",
  "#f0883e",
  "#1f6feb",
  "#db61a2",
  "#8b949e",
  "#2dd4bf",
  "#d29922",
];

function getProgressWidth(seconds: number, maxSeconds: number): number {
  if (seconds <= 0 || maxSeconds <= 0) {
    return 0;
  }

  return Math.max(8, Math.round((seconds / maxSeconds) * 100));
}

function getProjectCardStyle(color: string): CSSProperties {
  return { "--project-card-color": color } as CSSProperties;
}

function ProjectMetricIcon({ type }: { type: "tasks" | "time" | "active" }) {
  if (type === "time") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7" />
        <path d="M12 8v4l3 2" />
      </svg>
    );
  }

  if (type === "active") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 13h4l2-6 4 10 2-5h2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="5" width="12" height="14" rx="2" />
      <path d="M9 9h6" />
      <path d="M9 13h6" />
    </svg>
  );
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const { currentWorkspaceId, currentUserRole } = useWorkspace();
  const canCreateProject = canCreateProjects(currentUserRole);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsSummary, setProjectsSummary] = useState<ProjectsTimeSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectColor, setProjectColor] = useState(PROJECT_COLORS[1]);
  const [projectIcon, setProjectIcon] = useState<ProjectIconName>("folder");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function loadProjects() {
    setIsLoading(true);
    setError(null);

    try {
      const [nextProjects, nextSummary] = await Promise.all([
        ensureProjectsLoaded({ workspaceId: currentWorkspaceId ?? undefined }),
        getProjectsTimeSummary(currentWorkspaceId ?? undefined),
      ]);
      setProjects(nextProjects);
      setProjectsSummary(nextSummary);
    } catch {
      setError("Не удалось загрузить проекты");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (currentWorkspaceId) {
      void loadProjects();
    }
  }, [currentWorkspaceId]);

  const unassignedProject = projectsSummary?.items.find((item) => item.project_id === null) ?? null;
  const maxProjectSeconds = useMemo(
    () => Math.max(...projects.map((project) => project.total_time_seconds), unassignedProject?.total_time_seconds ?? 0, 0),
    [projects, unassignedProject],
  );

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);

    if (!projectName.trim()) {
      setCreateError("Введите название проекта");
      return;
    }

    try {
      setIsCreating(true);
      const createdProject = await createProject({
        name: projectName,
        description: projectDescription || null,
        color: projectColor,
        icon: projectIcon,
        workspace_id: currentWorkspaceId,
      });
      setProjectName("");
      setProjectDescription("");
      setProjectColor(PROJECT_COLORS[1]);
      setProjectIcon("folder");
      setIsCreateOpen(false);
      await loadProjects();
      navigate(`/projects/${createdProject.id}`);
    } catch (caughtError) {
      setCreateError(caughtError instanceof Error ? caughtError.message : "Не удалось создать проект");
    } finally {
      setIsCreating(false);
    }
  }

  function handleProjectCardKeyDown(event: KeyboardEvent<HTMLElement>, targetPath: string) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    navigate(targetPath);
  }

  return (
    <main className="projects-page app-container">
      <section className="projects-hero">
        <div>
          <p className="projects-hero__eyebrow">Проекты</p>
          <h1 className="page-heading">Проекты</h1>
          <p className="page-copy">
            Проекты помогают группировать задачи и отслеживать время по направлениям работы.
          </p>
        </div>
        <button
          className="button button--green projects-hero__button"
          type="button"
          onClick={() => setIsCreateOpen(true)}
          disabled={!canCreateProject}
          title={canCreateProject ? undefined : "Создавать проекты могут Owner и Team Lead"}
        >
          Создать проект
        </button>
      </section>

      <ProtectedSpaceStatus />

      {error && <div className="status-message status-message--error projects-status">{error}</div>}

      {isLoading ? (
        <div className="status-message projects-status">Загружаем проекты...</div>
      ) : projects.length > 0 || unassignedProject ? (
        <section className="projects-grid" aria-label="Список проектов">
          {projects.map((project) => {
            const progressWidth = getProgressWidth(project.total_time_seconds, maxProjectSeconds);
            const icon = getProjectFallbackIcon(project);

            return (
              <article
                className="project-card"
                key={project.id}
                role="link"
                tabIndex={0}
                style={getProjectCardStyle(project.color)}
                onClick={() => navigate(`/projects/${project.id}`)}
                onKeyDown={(event) => handleProjectCardKeyDown(event, `/projects/${project.id}`)}
              >
                <div className="project-card__header">
                  <ProjectIcon icon={icon} color={project.color} size="lg" />
                  <button
                    className="project-card__menu"
                    type="button"
                    aria-label={`Действия проекта ${project.name}`}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    ...
                  </button>
                </div>
                <div className="project-card__body">
                  <h2>{project.name}</h2>
                  <p>{project.description || "Без описания"}</p>
                </div>
                <div className="project-card__divider" />
                <div className="project-card__metrics">
                  <span>
                    <em>
                      <ProjectMetricIcon type="tasks" />
                      Задач
                    </em>
                    <strong>{project.tasks_count}</strong>
                  </span>
                  <span>
                    <em>
                      <ProjectMetricIcon type="time" />
                      Всего времени
                    </em>
                    <strong>{formatHumanDuration(project.total_time_seconds)}</strong>
                  </span>
                  <span>
                    <em>
                      <ProjectMetricIcon type="active" />
                      Активных задач
                    </em>
                    <strong>{project.active_tasks_count}</strong>
                  </span>
                </div>
                <div className="project-card__progress-row">
                  <div className="project-card__progress" aria-hidden="true">
                    <div
                      className="project-card__progress-fill"
                      style={{
                        width: `${progressWidth}%`,
                        backgroundColor: project.color,
                      }}
                    />
                  </div>
                  <span>{progressWidth}%</span>
                </div>
              </article>
            );
          })}

          {unassignedProject && (
            <button
              className="project-card project-card--unassigned"
              type="button"
              style={getProjectCardStyle(unassignedProject.color)}
              onClick={() => navigate("/dashboard?withoutProject=true")}
            >
              <div className="project-card__header">
                <ProjectIcon icon="briefcase" color={unassignedProject.color} size="lg" />
              </div>
              <div className="project-card__body">
                <h2>Без проекта</h2>
                <p>Задачи без привязки к проекту</p>
              </div>
              <div className="project-card__divider" />
              <div className="project-card__metrics">
                <span>
                  <em>
                    <ProjectMetricIcon type="tasks" />
                    Задач
                  </em>
                  <strong>{unassignedProject.tasks_count}</strong>
                </span>
                <span>
                  <em>
                    <ProjectMetricIcon type="time" />
                    Всего времени
                  </em>
                  <strong>{formatHumanDuration(unassignedProject.total_time_seconds)}</strong>
                </span>
                <span>
                  <em>
                    <ProjectMetricIcon type="active" />
                    Активных задач
                  </em>
                  <strong>{unassignedProject.active_tasks_count}</strong>
                </span>
              </div>
              <div className="project-card__progress-row">
                <div className="project-card__progress" aria-hidden="true">
                  <div
                    className="project-card__progress-fill"
                    style={{
                      width: `${getProgressWidth(unassignedProject.total_time_seconds, maxProjectSeconds)}%`,
                      backgroundColor: unassignedProject.color,
                    }}
                  />
                </div>
                <span>{getProgressWidth(unassignedProject.total_time_seconds, maxProjectSeconds)}%</span>
              </div>
            </button>
          )}
        </section>
      ) : (
        <section className="projects-empty">
          <h2>Проектов пока нет</h2>
          <p>Создайте первый проект, чтобы группировать задачи.</p>
          <button
            className="button button--green"
            type="button"
            onClick={() => setIsCreateOpen(true)}
            disabled={!canCreateProject}
            title={canCreateProject ? undefined : "Создавать проекты могут Owner и Team Lead"}
          >
            Создать проект
          </button>
        </section>
      )}

      {isCreateOpen && (
        <div className="project-modal-backdrop" role="presentation" onClick={() => setIsCreateOpen(false)}>
          <form className="project-modal" onSubmit={handleCreateProject} onClick={(event) => event.stopPropagation()}>
            <h2>Создать проект</h2>
            <div className="project-icon-preview">
              <ProjectIcon icon={projectIcon} color={projectColor} size="xl" />
              <div className="project-icon-preview__content">
                <p className="project-icon-preview__eyebrow">Иконка проекта</p>
                <h3>{projectName.trim() || "Новый проект"}</h3>
                <p>Выберите иконку, которая лучше всего описывает проект.</p>
              </div>
            </div>
            <label>
              <span>Название</span>
              <input
                className="text-field"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Например, Разработка backend"
              />
            </label>
            <label>
              <span>Описание</span>
              <textarea
                className="textarea-field"
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
                placeholder="Коротко о направлении работы"
              />
            </label>
            <div className="project-color-grid" aria-label="Цвет проекта">
              {PROJECT_COLORS.map((color) => (
                <button
                  className={`project-color${projectColor === color ? " project-color--active" : ""}`}
                  key={color}
                  type="button"
                  style={{ backgroundColor: color }}
                  onClick={() => setProjectColor(color)}
                  aria-label={`Выбрать цвет ${color}`}
                />
              ))}
            </div>
            <div className="project-icon-field">
              <span>Иконка проекта</span>
              <ProjectIconPicker value={projectIcon} color={projectColor} onChange={setProjectIcon} />
            </div>
            {createError && <p className="project-modal__error">{createError}</p>}
            <div className="project-modal__actions">
              <button className="button button--green" type="submit" disabled={isCreating}>
                {isCreating ? "Создаём..." : "Создать"}
              </button>
              <button className="button" type="button" onClick={() => setIsCreateOpen(false)} disabled={isCreating}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
