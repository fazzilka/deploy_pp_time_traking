import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PrioritySelect } from "../../components/PrioritySelect/PrioritySelect";
import { TaskDetailsModal } from "../../components/TaskDetailsModal/TaskDetailsModal";
import { TaskRow } from "../../components/TaskRow/TaskRow";
import {
  archiveProject,
  getProject,
  getProjects,
  getProjectSummary,
  getProjectTasks,
  updateProject,
} from "../../shared/api/projects";
import { createTask, deleteTask, startTaskTimer, stopTaskTimer } from "../../shared/api/tasks";
import type { Project, ProjectListItem, ProjectSummary } from "../../shared/types/project";
import type { Task, TaskPriority } from "../../shared/types/task";
import { formatHumanDuration } from "../../shared/utils/time";
import "./ProjectDetailPage.css";

type ActiveTimerState = {
  taskId: number;
  startedAt: string;
  order: number;
};

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

export function ProjectDetailPage() {
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
  const [error, setError] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [activeTimers, setActiveTimers] = useState<Record<number, ActiveTimerState>>({});
  const [tick, setTick] = useState(Date.now());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
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
  const [projectError, setProjectError] = useState<string | null>(null);

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
      setError("Проект не найден");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [nextProject, nextSummary, nextTasks, nextProjects] = await Promise.all([
        getProject(numericProjectId),
        getProjectSummary(numericProjectId),
        getProjectTasks(numericProjectId, {
          search: searchQuery,
          hasTime: hasTimeOnly,
          limit: 50,
          offset: 0,
        }),
        getProjects(),
      ]);
      setProject(nextProject);
      setSummary(nextSummary);
      setTasks(nextTasks);
      setProjects(nextProjects);
      syncActiveTimers(nextTasks);
      setSelectedTask((currentTask) => {
        if (!currentTask) {
          return null;
        }
        return nextTasks.find((task) => task.id === currentTask.id) ?? null;
      });
    } catch {
      setError("Не удалось загрузить проект");
    } finally {
      setIsLoading(false);
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

  function replaceTask(updatedTask: Task) {
    const listTask = keepActiveIntervalsOnly(updatedTask);
    setTasks((currentTasks) =>
      currentTasks
        .map((task) => (task.id === listTask.id ? listTask : task))
        .filter((task) => taskMatchesFilters(task)),
    );
    setSelectedTask((currentTask) => (currentTask?.id === listTask.id ? listTask : currentTask));
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    void loadProjectData();
  }, [numericProjectId, searchQuery, hasTimeOnly]);

  useEffect(() => {
    if (project) {
      setProjectName(project.name);
      setProjectDescription(project.description ?? "");
      setProjectColor(project.color);
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
    if (activeTimers[taskId]) {
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
      replaceTask(updatedTask);
    } catch {
      setError("Не удалось запустить таймер");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleStop(taskId: number) {
    setBusyTaskId(taskId);
    setError(null);

    try {
      const updatedTask = await stopTaskTimer(taskId);
      setActiveTimers((currentTimers) => {
        const nextTimers = { ...currentTimers };
        delete nextTimers[taskId];
        return nextTimers;
      });
      replaceTask(updatedTask);
      void loadProjectData();
    } catch {
      setError("Не удалось остановить таймер");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleDelete(taskId: number) {
    const shouldDelete = window.confirm("Удалить задачу? Все интервалы времени по ней также будут удалены.");
    if (!shouldDelete) {
      return;
    }

    setBusyTaskId(taskId);
    setError(null);

    try {
      await deleteTask(taskId);
      setSelectedTask((currentTask) => (currentTask?.id === taskId ? null : currentTask));
      setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
      void loadProjectData();
    } catch {
      setError("Не удалось удалить задачу");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTaskError(null);

    if (!taskTitle.trim()) {
      setTaskError("Введите название задачи");
      return;
    }

    try {
      const createdTask = keepActiveIntervalsOnly(
        await createTask({
          title: taskTitle,
          description: taskDescription || null,
          deadline: taskDeadline || null,
          priority: taskPriority,
          project_id: numericProjectId,
        }),
      );
      setTasks((currentTasks) => [createdTask, ...currentTasks].slice(0, 50));
      setTaskTitle("");
      setTaskDescription("");
      setTaskDeadline("");
      setTaskPriority("medium");
      setIsCreateOpen(false);
      void loadProjectData();
    } catch {
      setTaskError("Не удалось создать задачу");
    }
  }

  async function handleUpdateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectError(null);

    if (!projectName.trim()) {
      setProjectError("Введите название проекта");
      return;
    }

    try {
      const updatedProject = await updateProject(numericProjectId, {
        name: projectName,
        description: projectDescription || null,
        color: projectColor,
      });
      setProject(updatedProject);
      setIsEditOpen(false);
      void loadProjectData();
    } catch (caughtError) {
      setProjectError(caughtError instanceof Error ? caughtError.message : "Не удалось обновить проект");
    }
  }

  async function handleArchiveProject() {
    const shouldArchive = window.confirm("Архивировать проект? Задачи и история времени сохранятся.");
    if (!shouldArchive) {
      return;
    }

    try {
      await archiveProject(numericProjectId);
      navigate("/projects");
    } catch {
      setError("Не удалось архивировать проект");
    }
  }

  if (isLoading) {
    return (
      <main className="project-detail-page app-container">
        <div className="status-message">Загружаем проект...</div>
      </main>
    );
  }

  if (!project || !summary) {
    return (
      <main className="project-detail-page app-container">
        <div className="status-message status-message--error">{error || "Проект не найден"}</div>
        <Link className="button project-detail-page__back-button" to="/projects">
          Назад к проектам
        </Link>
      </main>
    );
  }

  return (
    <main className="project-detail-page app-container">
      <Link className="project-detail-page__back" to="/projects">
        ← Назад к проектам
      </Link>

      <section className="project-detail-hero">
        <div className="project-detail-hero__identity">
          <span className="project-detail-hero__icon" style={{ backgroundColor: project.color }}>
            {project.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="eyebrow">Проект</p>
            <h1 className="page-heading">{project.name}</h1>
            <p className="page-copy">{project.description || "Без описания"}</p>
          </div>
        </div>
        <div className="project-detail-hero__actions">
          <button className="button" type="button" onClick={() => setIsEditOpen(true)}>
            Редактировать
          </button>
          <button className="button button--red" type="button" onClick={() => void handleArchiveProject()}>
            Архивировать
          </button>
          <button className="button button--green" type="button" onClick={() => setIsCreateOpen(true)}>
            Создать задачу
          </button>
        </div>
      </section>

      {error && <div className="status-message status-message--error project-detail-status">{error}</div>}

      <section className="project-stats">
        <article>
          <span>Всего времени</span>
          <strong>{formatHumanDuration(summary.total_time_seconds)}</strong>
        </article>
        <article>
          <span>Задач</span>
          <strong>{summary.tasks_count}</strong>
        </article>
        <article>
          <span>Активных задач</span>
          <strong>{summary.active_tasks_count}</strong>
        </article>
        <article>
          <span>Задач с временем</span>
          <strong>{summary.tasks_with_time_count}</strong>
        </article>
      </section>

      <section className="project-tabs" aria-label="Разделы проекта">
        <button className="project-tabs__button project-tabs__button--active" type="button">
          Задачи
        </button>
        <button className="project-tabs__button" type="button">
          Статистика
        </button>
        <button className="project-tabs__button" type="button">
          Отчёты
        </button>
      </section>

      <section className="project-detail-grid">
        <section className="project-tasks-panel">
          <div className="project-tasks-panel__tools">
            <input
              className="text-field"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Поиск по задачам проекта"
            />
            <label>
              <input type="checkbox" checked={hasTimeOnly} onChange={(event) => setHasTimeOnly(event.target.checked)} />
              Только с временем
            </label>
          </div>

          {isCreateOpen && (
            <form className="project-task-create" onSubmit={handleCreateTask}>
              <label>
                <span>Название</span>
                <input className="text-field" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
              </label>
              <label>
                <span>Описание</span>
                <textarea
                  className="textarea-field"
                  value={taskDescription}
                  onChange={(event) => setTaskDescription(event.target.value)}
                />
              </label>
              <div className="project-task-create__row">
                <label>
                  <span>Срок выполнения</span>
                  <input
                    className="text-field"
                    type="date"
                    value={taskDeadline}
                    onChange={(event) => setTaskDeadline(event.target.value)}
                  />
                </label>
                <label>
                  <span>Приоритет</span>
                  <PrioritySelect value={taskPriority} onChange={setTaskPriority} />
                </label>
              </div>
              {taskError && <p className="project-detail-error">{taskError}</p>}
              <div className="project-task-create__actions">
                <button className="button button--green" type="submit">
                  Добавить
                </button>
                <button className="button" type="button" onClick={() => setIsCreateOpen(false)}>
                  Отмена
                </button>
              </div>
            </form>
          )}

          <div className="project-tasks-list">
            {tasks.length > 0 ? (
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
                  />
                );
              })
            ) : (
              <div className="tasks-empty">
                <h3>В проекте пока нет задач</h3>
                <p>Создайте первую задачу внутри проекта.</p>
                <button className="button button--green" type="button" onClick={() => setIsCreateOpen(true)}>
                  Создать задачу
                </button>
              </div>
            )}
          </div>
        </section>

        <aside className="project-summary-panel">
          <h2>Топ задач</h2>
          {summary.top_tasks.length > 0 ? (
            summary.top_tasks.map((task, index) => (
              <article className="project-summary-task" key={task.id}>
                <span>{index + 1}</span>
                <strong>{task.title}</strong>
                <em>{formatHumanDuration(task.total_time_seconds)}</em>
              </article>
            ))
          ) : (
            <div className="status-message">Недостаточно данных</div>
          )}
        </aside>
      </section>

      {isEditOpen && (
        <div className="project-modal-backdrop" role="presentation" onClick={() => setIsEditOpen(false)}>
          <form className="project-modal" onSubmit={handleUpdateProject} onClick={(event) => event.stopPropagation()}>
            <h2>Редактировать проект</h2>
            <label>
              <span>Название</span>
              <input
                className="text-field"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
            </label>
            <label>
              <span>Описание</span>
              <textarea
                className="textarea-field"
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
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
            {projectError && <p className="project-modal__error">{projectError}</p>}
            <div className="project-modal__actions">
              <button className="button button--green" type="submit">
                Сохранить
              </button>
              <button className="button" type="button" onClick={() => setIsEditOpen(false)}>
                Отмена
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
        />
      )}
    </main>
  );
}
