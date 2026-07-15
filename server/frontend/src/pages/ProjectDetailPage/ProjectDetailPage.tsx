import type { FormEvent} from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ProjectIcon,
  ProjectIconPicker,
  getProjectFallbackIcon,
  type ProjectIconName,
} from "../../components/ProjectIcon/ProjectIcon";
import { PrioritySelect } from "../../components/PrioritySelect/PrioritySelect";
import { ProtectedSpaceStatus } from "../../components/ProtectedSpaceStatus";
import { TaskDetailsModal } from "../../components/TaskDetailsModal/TaskDetailsModal";
import { datetimeLocalToUtcIso } from "../../shared/utils/deadline";
import { TaskRow } from "../../components/TaskRow/TaskRow";
import {
  applyProjectsTaskChange,
  archiveProject,
  ensureProjectsLoaded,
  getProject,
  getProjectSummary,
  getProjectTasks,
  updateProject,
} from "../../shared/api/projects";
import { createTask, deleteTask, startTaskTimer, stopTaskTimer, updateTask } from "../../shared/api/tasks";
import type { Project, ProjectListItem, ProjectSummary, ProjectSummaryTask } from "../../shared/types/project";
import type { Task, TaskPriority } from "../../shared/types/task";
import {
  canCreateProjects,
  canCreateTasks,
  canDeleteTasks,
  useWorkspace,
} from "../../shared/workspace/WorkspaceContext";
import { formatHumanDuration } from "../../shared/utils/time";
import { useLocale } from "../../i18n";
import "./ProjectDetailPage.css";

type ActiveTimerState = {
  taskId: number;
  startedAt: string;
  order: number;
};

type ProjectTab = "tasks" | "statistics" | "reports";
type ProjectStatIcon = "time" | "tasks" | "active" | "tracked";

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

function getActiveInterval(task: Task) {
  return task.time_intervals?.find((interval) => interval.ended_at === null) ?? null;
}

function keepActiveIntervalsOnly(task: Task): Task {
  return {
    ...task,
    time_intervals: task.time_intervals?.filter((interval) => interval.ended_at === null) ?? [],
  };
}

function isTaskActive(task: Task): boolean {
  return Boolean(getActiveInterval(task));
}

function toProjectSummaryTask(task: Task): ProjectSummaryTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    total_time_seconds: task.total_time_seconds,
    deadline: task.deadline,
    priority: task.priority,
  };
}

function sortTopTasks(tasks: ProjectSummaryTask[]): ProjectSummaryTask[] {
  return tasks
    .filter((task) => task.total_time_seconds > 0)
    .sort((firstTask, secondTask) => secondTask.total_time_seconds - firstTask.total_time_seconds)
    .slice(0, 5);
}

function StatIcon({ type }: { type: ProjectStatIcon }) {
  if (type === "time") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }

  if (type === "active") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 13h4l2-6 4 10 2-5h4" />
      </svg>
    );
  }

  if (type === "tracked") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12l4 4L19 6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M9 9h6" />
      <path d="M9 13h6" />
    </svg>
  );
}

function applyProjectSummaryTaskMutation(
  currentSummary: ProjectSummary | null,
  previousTask: Task | null,
  nextTask: Task | null,
): ProjectSummary | null {
  if (!currentSummary) {
    return currentSummary;
  }

  const previousBelongs = previousTask?.project_id === currentSummary.id;
  const nextBelongs = nextTask?.project_id === currentSummary.id;
  const previousTime = previousBelongs ? previousTask.total_time_seconds : 0;
  const nextTime = nextBelongs ? nextTask.total_time_seconds : 0;
  const previousActive = previousBelongs && previousTask ? isTaskActive(previousTask) : false;
  const nextActive = nextBelongs && nextTask ? isTaskActive(nextTask) : false;
  const previousHasTime = previousTime > 0;
  const nextHasTime = nextTime > 0;

  const topTasks = currentSummary.top_tasks.filter((task) => task.id !== previousTask?.id);
  if (nextBelongs && nextTask && nextTask.total_time_seconds > 0) {
    topTasks.push(toProjectSummaryTask(nextTask));
  }

  return {
    ...currentSummary,
    tasks_count: Math.max(
      0,
      currentSummary.tasks_count + (nextBelongs ? 1 : 0) - (previousBelongs ? 1 : 0),
    ),
    active_tasks_count: Math.max(
      0,
      currentSummary.active_tasks_count + (nextActive ? 1 : 0) - (previousActive ? 1 : 0),
    ),
    tasks_with_time_count: Math.max(
      0,
      currentSummary.tasks_with_time_count + (nextHasTime ? 1 : 0) - (previousHasTime ? 1 : 0),
    ),
    total_time_seconds: Math.max(0, currentSummary.total_time_seconds + nextTime - previousTime),
    top_tasks: sortTopTasks(topTasks),
  };
}

export function ProjectDetailPage() {
  const { locale, t, text } = useLocale();
  const { currentWorkspaceId, currentUserRole } = useWorkspace();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const numericProjectId = Number(projectId);
  const [project, setProject] = useState<Project | null>(null);
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasTimeOnly, setHasTimeOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTasksLoading, setIsTasksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [activeTimers, setActiveTimers] = useState<Record<number, ActiveTimerState>>({});
  const [tick, setTick] = useState(Date.now());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState<ProjectTab>("tasks");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDeadline, setTaskDeadline] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [taskError, setTaskError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectColor, setProjectColor] = useState(PROJECT_COLORS[1]);
  const [projectIcon, setProjectIcon] = useState<ProjectIconName>("folder");
  const [projectError, setProjectError] = useState<string | null>(null);
  const canManageProject = canCreateProjects(currentUserRole);
  const canMutateTasks = canCreateTasks(currentUserRole);
  const canDeleteTask = canDeleteTasks(currentUserRole);

  const activeTimerEntries = useMemo(
    () => Object.values(activeTimers).sort((firstTimer, secondTimer) => secondTimer.order - firstTimer.order),
    [activeTimers],
  );

  function syncActiveTimers(nextTasks: Task[]) {
    setActiveTimers((currentTimers) => {
      const validTaskIds = new Set(nextTasks.map((task) => task.id));
      const syncedTimers: Record<number, ActiveTimerState> = {};

      Object.values(currentTimers).forEach((timer) => {
        if (validTaskIds.has(timer.taskId)) {
          syncedTimers[timer.taskId] = timer;
        }
      });

      nextTasks.forEach((task) => {
        const activeInterval = getActiveInterval(task);

        if (activeInterval) {
          syncedTimers[task.id] = {
            taskId: task.id,
            startedAt: activeInterval.started_at,
            order: syncedTimers[task.id]?.order ?? new Date(activeInterval.started_at).getTime(),
          };
        }
      });

      return syncedTimers;
    });
  }

  async function loadProjectData() {
    if (!Number.isFinite(numericProjectId)) {
      setError(text("Проект не найден", "Project not found"));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [nextProject, nextSummary, nextProjects] = await Promise.all([
        getProject(numericProjectId),
        getProjectSummary(numericProjectId),
        ensureProjectsLoaded({ workspaceId: currentWorkspaceId ?? undefined }),
      ]);
      setProject(nextProject);
      setSummary(nextSummary);
      setProjects(nextProjects);
    } catch {
      setError(text("Не удалось загрузить проект", "Could not load project"));
    } finally {
      setIsLoading(false);
    }
  }

  async function loadProjectTasks() {
    if (!Number.isFinite(numericProjectId)) {
      return;
    }

    setIsTasksLoading(true);
    setError(null);

    try {
      const nextTasks = await getProjectTasks(numericProjectId, {
        search: searchQuery,
        hasTime: hasTimeOnly,
        limit: 50,
        offset: 0,
      });
      setTasks(nextTasks);
      syncActiveTimers(nextTasks);
      setSelectedTask((currentTask) => {
        if (!currentTask) {
          return null;
        }
        return nextTasks.find((task) => task.id === currentTask.id) ?? null;
      });
    } catch {
      setError(text("Не удалось загрузить задачи проекта", "Could not load project tasks"));
    } finally {
      setIsTasksLoading(false);
    }
  }

  function taskMatchesFilters(task: Task): boolean {
    const search = searchQuery.trim().toLowerCase();
    if (search && !task.title.toLowerCase().includes(search)) {
      return false;
    }
    if (hasTimeOnly && task.total_time_seconds <= 0) {
      return false;
    }
    return task.project_id === numericProjectId;
  }

  function replaceTask(previousTask: Task | null, updatedTask: Task) {
    const listTask = keepActiveIntervalsOnly(updatedTask);
    const shouldKeepTask = taskMatchesFilters(listTask);

    setTasks((currentTasks) => {
      const currentPreviousTask = currentTasks.find((task) => task.id === listTask.id) ?? previousTask;
      const nextTasks = currentTasks
        .map((task) => (task.id === listTask.id ? listTask : task))
        .filter((task) => taskMatchesFilters(task));

      setSummary((currentSummary) =>
        applyProjectSummaryTaskMutation(currentSummary, currentPreviousTask, shouldKeepTask ? listTask : null),
      );
      return nextTasks;
    });

    applyProjectsTaskChange({
      previousTask,
      nextTask: updatedTask,
    });

    if (!shouldKeepTask) {
      setActiveTimers((currentTimers) => {
        const nextTimers = { ...currentTimers };
        delete nextTimers[listTask.id];
        return nextTimers;
      });
    }

    setSelectedTask((currentTask) => {
      if (currentTask?.id !== listTask.id) {
        return currentTask;
      }

      return shouldKeepTask ? listTask : null;
    });
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    void loadProjectData();
  }, [currentWorkspaceId, numericProjectId]);

  useEffect(() => {
    if (!project) {
      return;
    }

    void loadProjectTasks();
  }, [numericProjectId, searchQuery, hasTimeOnly, project?.id]);

  useEffect(() => {
    if (project) {
      setProjectName(project.name);
      setProjectDescription(project.description ?? "");
      setProjectColor(project.color);
      setProjectIcon(getProjectFallbackIcon(project));
    }
  }, [project]);

  useEffect(() => {
    if (activeTimerEntries.length === 0) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setTick(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeTimerEntries.length]);

  function getTaskDisplaySeconds(task: Task): number {
    const activeTimer = activeTimers[task.id];
    if (!activeTimer) {
      return task.total_time_seconds;
    }
    return task.total_time_seconds + Math.max(0, Math.floor((tick - new Date(activeTimer.startedAt).getTime()) / 1000));
  }

  async function handleStart(taskId: number) {
    if (!canMutateTasks) {
      setError(t("tasks.errors.timerPermission"));
      return;
    }

    if (activeTimers[taskId]) {
      return;
    }

    const previousTask = tasks.find((task) => task.id === taskId) ?? null;
    if (previousTask?.is_completed) {
      setError(t("tasks.errors.completedTimer"));
      return;
    }

    setBusyTaskId(taskId);
    setError(null);

    try {
      const localStartedAt = new Date().toISOString();
      const updatedTask = await startTaskTimer(taskId);
      const startedAt = getActiveInterval(updatedTask)?.started_at ?? localStartedAt;
      setActiveTimers((currentTimers) => ({
        ...currentTimers,
        [taskId]: {
          taskId,
          startedAt,
          order: Date.now(),
        },
      }));
      replaceTask(previousTask, updatedTask);
    } catch {
      setError(t("tasks.errors.timerStart"));
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleStop(taskId: number) {
    if (!canMutateTasks) {
      setError(t("tasks.errors.timerStopPermission"));
      return;
    }

    setBusyTaskId(taskId);
    setError(null);

    try {
      const previousTask = tasks.find((task) => task.id === taskId) ?? null;
      const updatedTask = await stopTaskTimer(taskId);
      setActiveTimers((currentTimers) => {
        const nextTimers = { ...currentTimers };
        delete nextTimers[taskId];
        return nextTimers;
      });
      replaceTask(previousTask, updatedTask);
    } catch {
      setError(t("tasks.errors.timerStop"));
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleToggleCompleted(task: Task) {
    if (!canMutateTasks) {
      setError(t("tasks.errors.editPermission"));
      return;
    }

    if (activeTimers[task.id] || getActiveInterval(task)) {
      setError(t("tasks.errors.stopFirst"));
      return;
    }

    const optimisticTask = {
      ...task,
      is_completed: !task.is_completed,
    };

    setBusyTaskId(task.id);
    setError(null);
    replaceTask(task, optimisticTask);

    try {
      const updatedTask = await updateTask(task.id, {
        is_completed: optimisticTask.is_completed,
      });
      replaceTask(optimisticTask, updatedTask);
    } catch (caughtError) {
      replaceTask(optimisticTask, task);
      setError(caughtError instanceof Error ? caughtError.message : t("tasks.errors.update"));
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleDelete(taskId: number) {
    if (!canDeleteTask) {
      setError(t("tasks.errors.deletePermission"));
      return;
    }

    const shouldDelete = window.confirm(t("tasks.confirm.delete"));
    if (!shouldDelete) {
      return;
    }

    setBusyTaskId(taskId);
    setError(null);

    try {
      const taskToDelete = tasks.find((task) => task.id === taskId) ?? null;
      await deleteTask(taskId);
      setSelectedTask((currentTask) => (currentTask?.id === taskId ? null : currentTask));
      setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
      setSummary((currentSummary) =>
        applyProjectSummaryTaskMutation(currentSummary, taskToDelete, null),
      );
      if (taskToDelete) {
        applyProjectsTaskChange({
          previousTask: taskToDelete,
          nextTask: null,
        });
      }
      setActiveTimers((currentTimers) => {
        const nextTimers = { ...currentTimers };
        delete nextTimers[taskId];
        return nextTimers;
      });
    } catch {
      setError(t("tasks.errors.delete"));
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTaskError(null);

    if (!canMutateTasks) {
      setTaskError(t("tasks.errors.createPermission"));
      return;
    }

    if (!taskTitle.trim()) {
      setTaskError(t("tasks.errors.titleRequired"));
      return;
    }

    try {
      const createdTask = keepActiveIntervalsOnly(
        await createTask({
          title: taskTitle,
          description: taskDescription || null,
          deadline: datetimeLocalToUtcIso(taskDeadline),
          priority: taskPriority,
          workspace_id: project?.workspace_id ?? currentWorkspaceId,
          project_id: numericProjectId,
        }),
      );
      setTasks((currentTasks) =>
        taskMatchesFilters(createdTask) ? [createdTask, ...currentTasks].slice(0, 50) : currentTasks,
      );
      setSummary((currentSummary) =>
        applyProjectSummaryTaskMutation(currentSummary, null, createdTask),
      );
      applyProjectsTaskChange({
        previousTask: null,
        nextTask: createdTask,
      });
      setTaskTitle("");
      setTaskDescription("");
      setTaskDeadline("");
      setTaskPriority("medium");
      setIsCreateOpen(false);
    } catch {
      setTaskError(t("tasks.errors.create"));
    }
  }

  async function handleUpdateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectError(null);

    if (!canManageProject) {
      setProjectError(text("Редактировать проекты могут только Owner и Team Lead", "Only Owners and Team Leads can edit projects"));
      return;
    }

    if (!projectName.trim()) {
      setProjectError(t("projects.errors.nameRequired"));
      return;
    }

    try {
      const updatedProject = await updateProject(numericProjectId, {
        name: projectName,
        description: projectDescription || null,
        color: projectColor,
        icon: projectIcon,
      });
      setProject(updatedProject);
      setSummary((currentSummary) =>
        currentSummary
          ? {
              ...currentSummary,
              name: updatedProject.name,
              description: updatedProject.description,
              color: updatedProject.color,
              icon: updatedProject.icon,
              is_archived: updatedProject.is_archived,
              updated_at: updatedProject.updated_at,
            }
          : currentSummary,
      );
      setProjects((currentProjects) =>
        currentProjects.map((projectItem) =>
          projectItem.id === updatedProject.id ? { ...projectItem, ...updatedProject } : projectItem,
        ),
      );
      setIsEditOpen(false);
    } catch (caughtError) {
      setProjectError(caughtError instanceof Error ? caughtError.message : text("Не удалось обновить проект", "Could not update project"));
    }
  }

  async function handleArchiveProject() {
    if (!canManageProject) {
      setError(text("Архивировать проекты могут только Owner и Team Lead", "Only Owners and Team Leads can archive projects"));
      return;
    }

    const shouldArchive = window.confirm(text("Архивировать проект? Задачи и история времени сохранятся.", "Archive this project? Tasks and time history will be preserved."));
    if (!shouldArchive) {
      return;
    }

    try {
      await archiveProject(numericProjectId);
      navigate("/projects");
    } catch {
      setError(text("Не удалось архивировать проект", "Could not archive project"));
    }
  }

  if (isLoading) {
    return (
      <main className="project-detail-page app-container">
        <div className="status-message">{text("Загружаем проект...", "Loading project...")}</div>
      </main>
    );
  }

  if (!project || !summary) {
    return (
      <main className="project-detail-page app-container">
        <div className="status-message status-message--error">{error || text("Проект не найден", "Project not found")}</div>
        <Link className="button project-detail-page__back-button" to="/projects">
          {t("projects.navigation.back")}
        </Link>
      </main>
    );
  }

  const tasksWithTimePercent =
    summary.tasks_count > 0 ? Math.round((summary.tasks_with_time_count / summary.tasks_count) * 100) : 0;
  const activeTasksPercent =
    summary.tasks_count > 0 ? Math.round((summary.active_tasks_count / summary.tasks_count) * 100) : 0;
  const averageTrackedTaskTime =
    summary.tasks_with_time_count > 0
      ? Math.floor(summary.total_time_seconds / summary.tasks_with_time_count)
      : 0;
  const topTaskMaxTime = Math.max(...summary.top_tasks.map((task) => task.total_time_seconds), 1);
  const heroProjectIcon = getProjectFallbackIcon(project);

  return (
    <main className="project-detail-page app-container">
      <Link className="project-detail-page__back" to="/projects">
        ← {t("projects.navigation.back")}
      </Link>

      <section className="project-detail-hero">
        <div className="project-detail-hero__main">
          <ProjectIcon icon={heroProjectIcon} color={project.color} size="xl" />
          <div>
            <p className="project-detail-hero__eyebrow">{text("Проект", "Project")}</p>
            <h1 className="page-heading">{project.name}</h1>
            <p className="page-copy">{project.description || t("tasks.labels.noDescription")}</p>
          </div>
        </div>
        <div className="project-detail-hero__actions">
          <button className="button" type="button" onClick={() => setIsEditOpen(true)} disabled={!canManageProject}>
            {t("common.actions.edit")}
          </button>
          <button
            className="button button--red"
            type="button"
            onClick={() => void handleArchiveProject()}
            disabled={!canManageProject}
          >
            {t("common.actions.archive")}
          </button>
          <button
            className="button button--green"
            type="button"
            onClick={() => setIsCreateOpen(true)}
            disabled={!canMutateTasks}
          >
            {t("tasks.actions.create")}
          </button>
        </div>
      </section>

      <ProtectedSpaceStatus />

      {error && <div className="status-message status-message--error project-detail-status">{error}</div>}

      <section className="project-stats">
        <article>
          <span className="project-stats__icon project-stats__icon--time">
            <StatIcon type="time" />
          </span>
          <div>
            <span>{t("projects.metrics.totalTime")}</span>
            <strong>{formatHumanDuration(summary.total_time_seconds, locale)}</strong>
          </div>
        </article>
        <article>
          <span className="project-stats__icon project-stats__icon--tasks">
            <StatIcon type="tasks" />
          </span>
          <div>
            <span>{t("projects.metrics.tasks")}</span>
            <strong>{summary.tasks_count}</strong>
          </div>
        </article>
        <article>
          <span className="project-stats__icon project-stats__icon--active">
            <StatIcon type="active" />
          </span>
          <div>
            <span>{t("projects.metrics.activeTasks")}</span>
            <strong>{summary.active_tasks_count}</strong>
          </div>
        </article>
        <article>
          <span className="project-stats__icon project-stats__icon--tracked">
            <StatIcon type="tracked" />
          </span>
          <div>
            <span>{t("reports.stats.tasks")}</span>
            <strong>{summary.tasks_with_time_count}</strong>
          </div>
        </article>
      </section>

      <section className="project-tabs" role="tablist" aria-label={text("Разделы проекта", "Project sections")}>
        <button
          className={`project-tabs__button${activeTab === "tasks" ? " project-tabs__button--active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTab === "tasks"}
          aria-controls="project-tab-tasks"
          onClick={() => setActiveTab("tasks")}
        >
          {t("projects.details.tabs.tasks")}
        </button>
        <button
          className={`project-tabs__button${activeTab === "statistics" ? " project-tabs__button--active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTab === "statistics"}
          aria-controls="project-tab-statistics"
          onClick={() => setActiveTab("statistics")}
        >
          {t("projects.details.tabs.statistics")}
        </button>
        <button
          className={`project-tabs__button${activeTab === "reports" ? " project-tabs__button--active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTab === "reports"}
          aria-controls="project-tab-reports"
          onClick={() => setActiveTab("reports")}
        >
          {t("projects.details.tabs.reports")}
        </button>
      </section>

      {activeTab === "tasks" && (
      <section className="project-detail-grid" id="project-tab-tasks" role="tabpanel">
        <section className="project-tasks-panel">
          <div className="project-tasks-panel__tools">
            <input
              className="text-field"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={text("Поиск по задачам проекта", "Search project tasks")}
            />
            <label>
              <input type="checkbox" checked={hasTimeOnly} onChange={(event) => setHasTimeOnly(event.target.checked)} />
              {t("tasks.filters.withTime")}
            </label>
          </div>

          {isCreateOpen && (
            <form className="project-task-create" onSubmit={handleCreateTask}>
              <label>
                <span>{t("tasks.form.title")}</span>
                <input className="text-field" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
              </label>
              <label>
                <span>{t("tasks.form.description")}</span>
                <textarea
                  className="textarea-field"
                  value={taskDescription}
                  onChange={(event) => setTaskDescription(event.target.value)}
                />
              </label>
              <div className="project-task-create__row">
                <label>
                  <span>{t("tasks.form.deadline")}</span>
                  <input
                    className="text-field"
                    type="datetime-local"
                    value={taskDeadline}
                    onChange={(event) => setTaskDeadline(event.target.value)}
                  />
                </label>
                <label>
                  <span>{t("tasks.form.priority")}</span>
                  <PrioritySelect value={taskPriority} onChange={setTaskPriority} />
                </label>
              </div>
              {taskError && <p className="project-detail-error">{taskError}</p>}
              <div className="project-task-create__actions">
                <button className="button button--green" type="submit">
                  {t("tasks.form.add")}
                </button>
                <button className="button" type="button" onClick={() => setIsCreateOpen(false)}>
                  {t("common.actions.cancel")}
                </button>
              </div>
            </form>
          )}

          <div className="project-tasks-list">
            {isTasksLoading ? (
              <div className="status-message">{text("Загружаем задачи проекта...", "Loading project tasks...")}</div>
            ) : tasks.length > 0 ? (
              tasks.map((task) => {
                const isActive = Boolean(activeTimers[task.id]);
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isActive={isActive}
                    displaySeconds={getTaskDisplaySeconds(task)}
                    isBusy={busyTaskId === task.id}
                    onOpen={setSelectedTask}
                    onStart={(taskId) => void handleStart(taskId)}
                    onStop={(taskId) => void handleStop(taskId)}
                    onDelete={(taskId) => void handleDelete(taskId)}
                    onToggleCompleted={(task) => void handleToggleCompleted(task)}
                    canStartTimer={canMutateTasks}
                    canDeleteTask={canDeleteTask}
                    canToggleCompleted={canMutateTasks}
                  />
                );
              })
            ) : (
              <div className="tasks-empty">
                <h3>{text("В проекте пока нет задач", "No tasks in this project yet")}</h3>
                <p>{text("Создайте первую задачу внутри проекта.", "Create the first task in this project.")}</p>
                <button
                  className="button button--green"
                  type="button"
                  onClick={() => setIsCreateOpen(true)}
                  disabled={!canMutateTasks}
                >
                  {t("tasks.actions.create")}
                </button>
              </div>
            )}
          </div>
        </section>

        <aside className="project-summary-panel">
          <h2>{t("profile.tasks.title")}</h2>
          {summary.top_tasks.length > 0 ? (
            summary.top_tasks.map((task, index) => (
              <article className="project-summary-task" key={task.id}>
                <span>{index + 1}</span>
                <strong>{task.title}</strong>
                <em>{formatHumanDuration(task.total_time_seconds, locale)}</em>
              </article>
            ))
          ) : (
            <div className="status-message">{t("reports.stats.noData")}</div>
          )}
        </aside>
      </section>
      )}

      {activeTab === "statistics" && (
        <section className="project-analytics-grid" id="project-tab-statistics" role="tabpanel">
          <article className="project-analytics-card project-analytics-card--wide">
            <div>
              <h2>{text("Активность проекта", "Project activity")}</h2>
              <p>{text("Сводка по текущим задачам и закрытым интервалам.", "A summary of current tasks and completed intervals.")}</p>
            </div>
            <div className="project-distribution">
              <div className="project-distribution__item">
                <span>{t("reports.stats.tasks")}</span>
                <strong>{tasksWithTimePercent}%</strong>
                <div>
                  <i style={{ width: `${tasksWithTimePercent}%`, backgroundColor: project.color }} />
                </div>
              </div>
              <div className="project-distribution__item">
                <span>{t("projects.metrics.activeTasks")}</span>
                <strong>{activeTasksPercent}%</strong>
                <div>
                  <i style={{ width: `${activeTasksPercent}%`, backgroundColor: "var(--color-yellow)" }} />
                </div>
              </div>
            </div>
          </article>

          <article className="project-analytics-card">
            <h2>{t("reports.charts.daily")}</h2>
            <p className="project-analytics-card__empty">
              {t("projects.details.dailyEmpty")}
            </p>
          </article>

          <article className="project-analytics-card project-analytics-card--wide">
            <h2>{text("Топ задач проекта", "Top project tasks")}</h2>
            {summary.top_tasks.length > 0 ? (
              <div className="project-top-bars">
                {summary.top_tasks.map((task) => (
                  <div className="project-top-bar" key={task.id}>
                    <span>{task.title}</span>
                    <strong>{formatHumanDuration(task.total_time_seconds, locale)}</strong>
                    <div>
                      <i
                        style={{
                          width: `${Math.max(8, (task.total_time_seconds / topTaskMaxTime) * 100)}%`,
                          backgroundColor: project.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="status-message">{text("Недостаточно данных для статистики", "Not enough data for statistics")}</div>
            )}
          </article>
        </section>
      )}

      {activeTab === "reports" && (
        <section className="project-report-grid" id="project-tab-reports" role="tabpanel">
          <article className="project-report-card">
            <span>{t("projects.metrics.totalTime")}</span>
            <strong>{formatHumanDuration(summary.total_time_seconds, locale)}</strong>
            <p>{text("Сумма времени всех задач проекта.", "Total time across all project tasks.")}</p>
          </article>
          <article className="project-report-card">
            <span>{text("Среднее по задачам с временем", "Average for tasks with time")}</span>
            <strong>{formatHumanDuration(averageTrackedTaskTime, locale)}</strong>
            <p>{text("Среднее значение среди задач, где есть закрытые интервалы.", "Average across tasks that have completed intervals.")}</p>
          </article>
          <article className="project-report-card">
            <span>{t("reports.stats.tasks")}</span>
            <strong>{summary.tasks_with_time_count}</strong>
            <p>{t("projects.details.taskCount", { count: summary.tasks_count })}</p>
          </article>
          <article className="project-report-card project-report-card--wide">
            <h2>{text("Мини-отчёт по проекту", "Project summary report")}</h2>
            {summary.top_tasks.length > 0 ? (
              <div className="project-report-list">
                {summary.top_tasks.map((task, index) => (
                  <div className="project-report-list__item" key={task.id}>
                    <span>{index + 1}</span>
                    <strong>{task.title}</strong>
                    <em>{formatHumanDuration(task.total_time_seconds, locale)}</em>
                  </div>
                ))}
              </div>
            ) : (
              <div className="status-message">{text("По проекту пока нет задач с временем", "No tasks with tracked time in this project yet")}</div>
            )}
          </article>
        </section>
      )}

      {isEditOpen && (
        <div className="project-modal-backdrop" role="presentation" onClick={() => setIsEditOpen(false)}>
          <form className="project-modal" onSubmit={handleUpdateProject} onClick={(event) => event.stopPropagation()}>
            <h2>{text("Редактировать проект", "Edit project")}</h2>
            <div className="project-icon-preview">
              <ProjectIcon icon={projectIcon} color={projectColor} size="xl" />
              <div className="project-icon-preview__content">
                <p className="project-icon-preview__eyebrow">{t("projects.form.icon")}</p>
                <h3>{projectName.trim() || project.name}</h3>
                <p>{t("projects.form.iconHint")}</p>
              </div>
            </div>
            <label>
              <span>{t("projects.form.name")}</span>
              <input
                className="text-field"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
            </label>
            <label>
              <span>{t("projects.form.description")}</span>
              <textarea
                className="textarea-field"
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
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
            {projectError && <p className="project-modal__error">{projectError}</p>}
            <div className="project-modal__actions">
              <button className="button button--green" type="submit">
                {t("common.actions.save")}
              </button>
              <button className="button" type="button" onClick={() => setIsEditOpen(false)}>
                {t("common.actions.cancel")}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedTask && (
        <TaskDetailsModal
          task={selectedTask}
          isActive={Boolean(activeTimers[selectedTask.id])}
          displaySeconds={getTaskDisplaySeconds(selectedTask)}
          isBusy={busyTaskId === selectedTask.id}
          onClose={() => setSelectedTask(null)}
          onStart={(taskId) => void handleStart(taskId)}
          onStop={(taskId) => void handleStop(taskId)}
          onDelete={(taskId) => void handleDelete(taskId)}
          onTaskUpdated={replaceTask}
          projects={projects}
          canStartTimer={canMutateTasks}
          canDeleteTask={canDeleteTask}
          canEditTask={canMutateTasks}
        />
      )}
    </main>
  );
}
