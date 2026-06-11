import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createProject,
  getProjects,
  getProjectsTimeSummary,
} from "../../shared/api/projects";
import type {
  ProjectListItem,
  ProjectsTimeSummaryResponse,
} from "../../shared/types/project";
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

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsSummary, setProjectsSummary] = useState<ProjectsTimeSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectColor, setProjectColor] = useState(PROJECT_COLORS[1]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function loadProjects() {
    setIsLoading(true);
    setError(null);

    try {
      const [nextProjects, nextSummary] = await Promise.all([
        getProjects(),
        getProjectsTimeSummary(),
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
    void loadProjects();
  }, []);

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
      });
      setProjectName("");
      setProjectDescription("");
      setProjectColor(PROJECT_COLORS[1]);
      setIsCreateOpen(false);
      await loadProjects();
      navigate(`/projects/${createdProject.id}`);
    } catch (caughtError) {
      setCreateError(caughtError instanceof Error ? caughtError.message : "Не удалось создать проект");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="projects-page app-container">
      <section className="projects-hero">
        <div>
          <p className="eyebrow">Проекты</p>
          <h1 className="page-heading">Проекты</h1>
          <p className="page-copy">
            Проекты помогают группировать задачи и отслеживать время по направлениям работы.
          </p>
        </div>
        <button className="button button--green projects-hero__button" type="button" onClick={() => setIsCreateOpen(true)}>
          Создать проект
        </button>
      </section>

      {error && <div className="status-message status-message--error projects-status">{error}</div>}

      {isLoading ? (
        <div className="status-message projects-status">Загружаем проекты...</div>
      ) : projects.length > 0 || unassignedProject ? (
        <section className="projects-grid" aria-label="Список проектов">
          {projects.map((project) => {
            const progressWidth = getProgressWidth(project.total_time_seconds, maxProjectSeconds);

            return (
              <Link className="project-card" to={`/projects/${project.id}`} key={project.id}>
                <div className="project-card__header">
                  <span className="project-card__icon" style={{ backgroundColor: project.color }}>
                    {project.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="project-card__menu" aria-hidden="true">
                    ...
                  </span>
                </div>
                <h2>{project.name}</h2>
                <p>{project.description || "Без описания"}</p>
                <div className="project-card__divider" />
                <div className="project-card__metrics">
                  <span>
                    Задач
                    <strong>{project.tasks_count}</strong>
                  </span>
                  <span>
                    Всего времени
                    <strong>{formatHumanDuration(project.total_time_seconds)}</strong>
                  </span>
                  <span>
                    Активных задач
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
              </Link>
            );
          })}

          {unassignedProject && (
            <button
              className="project-card project-card--unassigned"
              type="button"
              onClick={() => navigate("/dashboard?withoutProject=true")}
            >
              <div className="project-card__header">
                <span className="project-card__icon" style={{ backgroundColor: unassignedProject.color }}>
                  Б
                </span>
              </div>
              <h2>Без проекта</h2>
              <p>Задачи без привязки к проекту</p>
              <div className="project-card__divider" />
              <div className="project-card__metrics">
                <span>
                  Задач
                  <strong>{unassignedProject.tasks_count}</strong>
                </span>
                <span>
                  Всего времени
                  <strong>{formatHumanDuration(unassignedProject.total_time_seconds)}</strong>
                </span>
                <span>
                  Активных задач
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
          <button className="button button--green" type="button" onClick={() => setIsCreateOpen(true)}>
            Создать проект
          </button>
        </section>
      )}

      {isCreateOpen && (
        <div className="project-modal-backdrop" role="presentation" onClick={() => setIsCreateOpen(false)}>
          <form className="project-modal" onSubmit={handleCreateProject} onClick={(event) => event.stopPropagation()}>
            <h2>Создать проект</h2>
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
