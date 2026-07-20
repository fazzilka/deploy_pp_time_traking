import type { FormEvent, KeyboardEvent} from "react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ProjectIcon,
  ProjectIconPicker,
  getProjectFallbackIcon,
  type ProjectIconName,
} from "../../components/ProjectIcon/ProjectIcon";
import { LoadingSkeleton } from "../../components/LoadingSkeleton/LoadingSkeleton";
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
import { useLocale } from "../../i18n";
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
  const { locale, t } = useLocale();
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
      setError(t("projects.errors.load"));
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
      setCreateError(t("projects.errors.nameRequired"));
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
      setCreateError(caughtError instanceof Error ? caughtError.message : t("projects.errors.create"));
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
          <p className="projects-hero__eyebrow">{t("projects.title")}</p>
          <h1 className="page-heading">{t("projects.title")}</h1>
          <p className="page-copy">
            {t("projects.description")}
          </p>
        </div>
        <button
          className="button button--green projects-hero__button"
          type="button"
          onClick={() => setIsCreateOpen(true)}
          disabled={!canCreateProject}
          title={canCreateProject ? undefined : t("projects.actions.permission")}
        >
          {t("projects.actions.create")}
        </button>
      </section>

      <ProtectedSpaceStatus />

      {error && <div className="status-message status-message--error projects-status">{error}</div>}

      {isLoading ? (
        <LoadingSkeleton label={t("projects.loading")} variant="cards" />
      ) : projects.length > 0 || unassignedProject ? (
        <section className="projects-grid content-reveal" aria-label={t("projects.listLabel")}>
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
                    aria-label={t("projects.actions.menu", { name: project.name })}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    ...
                  </button>
                </div>
                <div className="project-card__body">
                  <h2>{project.name}</h2>
                  <p>{project.description || t("tasks.labels.noDescription")}</p>
                </div>
                <div className="project-card__divider" />
                <div className="project-card__metrics">
                  <span>
                    <em>
                      <ProjectMetricIcon type="tasks" />
                      {t("projects.metrics.tasks")}
                    </em>
                    <strong>{project.tasks_count}</strong>
                  </span>
                  <span>
                    <em>
                      <ProjectMetricIcon type="time" />
                      {t("projects.metrics.totalTime")}
                    </em>
                    <strong>{formatHumanDuration(project.total_time_seconds, locale)}</strong>
                  </span>
                  <span>
                    <em>
                      <ProjectMetricIcon type="active" />
                      {t("projects.metrics.activeTasks")}
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
                <h2>{t("projects.unassigned.title")}</h2>
                <p>{t("projects.unassigned.description")}</p>
              </div>
              <div className="project-card__divider" />
              <div className="project-card__metrics">
                <span>
                  <em>
                    <ProjectMetricIcon type="tasks" />
                    {t("projects.metrics.tasks")}
                  </em>
                  <strong>{unassignedProject.tasks_count}</strong>
                </span>
                <span>
                  <em>
                    <ProjectMetricIcon type="time" />
                    {t("projects.metrics.totalTime")}
                  </em>
                    <strong>{formatHumanDuration(unassignedProject.total_time_seconds, locale)}</strong>
                </span>
                <span>
                  <em>
                    <ProjectMetricIcon type="active" />
                    {t("projects.metrics.activeTasks")}
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
          <h2>{t("projects.empty.title")}</h2>
          <p>{t("projects.empty.description")}</p>
          <button
            className="button button--green"
            type="button"
            onClick={() => setIsCreateOpen(true)}
            disabled={!canCreateProject}
            title={canCreateProject ? undefined : t("projects.actions.permission")}
          >
            {t("projects.actions.create")}
          </button>
        </section>
      )}

      {isCreateOpen && (
        <div className="project-modal-backdrop" role="presentation" onClick={() => setIsCreateOpen(false)}>
          <form className="project-modal" onSubmit={handleCreateProject} onClick={(event) => event.stopPropagation()}>
            <h2>{t("projects.actions.create")}</h2>
            <div className="project-icon-preview">
              <ProjectIcon icon={projectIcon} color={projectColor} size="xl" />
              <div className="project-icon-preview__content">
                <p className="project-icon-preview__eyebrow">{t("projects.form.icon")}</p>
                <h3>{projectName.trim() || t("projects.form.newProject")}</h3>
                <p>{t("projects.form.iconHint")}</p>
              </div>
            </div>
            <label>
              <span>{t("projects.form.name")}</span>
              <input
                className="text-field"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder={t("projects.form.namePlaceholder")}
              />
            </label>
            <label>
              <span>{t("projects.form.description")}</span>
              <textarea
                className="textarea-field"
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
                placeholder={t("projects.form.descriptionPlaceholder")}
              />
            </label>
            <div className="project-color-grid" aria-label={t("projects.form.color")}>
              {PROJECT_COLORS.map((color) => (
                <button
                  className={`project-color${projectColor === color ? " project-color--active" : ""}`}
                  key={color}
                  type="button"
                  style={{ backgroundColor: color }}
                  onClick={() => setProjectColor(color)}
                  aria-label={t("projects.form.chooseColor", { color })}
                />
              ))}
            </div>
            <div className="project-icon-field">
              <span>{t("projects.form.icon")}</span>
              <ProjectIconPicker value={projectIcon} color={projectColor} onChange={setProjectIcon} />
            </div>
            {createError && <p className="project-modal__error">{createError}</p>}
            <div className="project-modal__actions">
              <button className="button button--green" type="submit" disabled={isCreating}>
                {t(isCreating ? "common.actions.creating" : "common.actions.create")}
              </button>
              <button className="button" type="button" onClick={() => setIsCreateOpen(false)} disabled={isCreating}>
                {t("common.actions.cancel")}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
