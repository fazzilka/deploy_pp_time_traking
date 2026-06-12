import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PrioritySelect } from "../../components/PrioritySelect/PrioritySelect";
import { TaskDetailsModal } from "../../components/TaskDetailsModal/TaskDetailsModal";
import { TaskRow } from "../../components/TaskRow/TaskRow";
import { TimerCard } from "../../components/TimerCard/TimerCard";
import { applyProjectsTaskChange, getProjects } from "../../shared/api/projects";
import { createTask, deleteTask, getTasks, startTaskTimer, stopTaskTimer, updateTask } from "../../shared/api/tasks";
import type { ProjectListItem } from "../../shared/types/project";
import type { Task, TaskPriority } from "../../shared/types/task";
import "./DashboardPage.css";

type ActiveTimerState = {
  taskId: number;
  startedAt: string;
  order: number;
};

const TASKS_PAGE_LIMIT = 50;
type ProjectFilter = "all" | "none" | string;

function getActiveInterval(task: Task) {
  return task.time_intervals?.find((interval) => interval.ended_at === null) ?? null;
}

function keepActiveIntervalsOnly(task: Task): Task {
  return {
    ...task,
    time_intervals: task.time_intervals?.filter((interval) => interval.ended_at === null) ?? [],
  };
}

export function DashboardPage() {
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasTimeOnly, setHasTimeOnly] = useState(false);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<ProjectFilter>(
    searchParams.get("withoutProject") === "true" ? "none" : searchParams.get("projectId") || "all",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [tick, setTick] = useState(Date.now());
  const [activeTimers, setActiveTimers] = useState<Record<number, ActiveTimerState>>({});
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [newProjectId, setNewProjectId] = useState<ProjectFilter>("none");
  const [createError, setCreateError] = useState<string | null>(null);

  const activeTimerEntries = useMemo(
    () => Object.values(activeTimers).sort((firstTimer, secondTimer) => secondTimer.order - firstTimer.order),
    [activeTimers],
  );

  const primaryActiveTimer = activeTimerEntries[0] ?? null;
  const activeTask = useMemo(
    () => (primaryActiveTimer ? tasks.find((task) => task.id === primaryActiveTimer.taskId) ?? null : null),
    [primaryActiveTimer, tasks],
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

  async function loadTasks() {
    setIsLoading(true);
    setError(null);

    try {
      const nextTasks = await getTasks({
        search: searchQuery,
        hasTime: hasTimeOnly,
        projectId: selectedProjectFilter !== "all" && selectedProjectFilter !== "none" ? Number(selectedProjectFilter) : undefined,
        withoutProject: selectedProjectFilter === "none",
        limit: TASKS_PAGE_LIMIT,
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
      setError("Не удалось загрузить задачи");
    } finally {
      setIsLoading(false);
    }
  }

  function taskMatchesCurrentFilters(task: Task): boolean {
    const search = searchQuery.trim().toLowerCase();

    if (search && !task.title.toLowerCase().includes(search)) {
      return false;
    }

    if (hasTimeOnly && task.total_time_seconds <= 0) {
      return false;
    }

    if (selectedProjectFilter === "none") {
      return task.project_id == null;
    }

    if (selectedProjectFilter !== "all") {
      return task.project_id === Number(selectedProjectFilter);
    }

    return true;
  }

  async function loadProjects() {
    try {
      setProjects(await getProjects());
    } catch {
      setProjects([]);
    }
  }

  function getDefaultProjectForCreate(): ProjectFilter {
    return selectedProjectFilter === "all" ? "none" : selectedProjectFilter;
  }

  function openCreateTask() {
    setNewProjectId(getDefaultProjectForCreate());
    setIsCreateOpen(true);
  }

  function replaceTask(previousTask: Task | null, updatedTask: Task) {
    const listTask = keepActiveIntervalsOnly(updatedTask);

    setTasks((currentTasks) =>
      currentTasks
        .map((task) => (task.id === listTask.id ? listTask : task))
        .filter((task) => taskMatchesCurrentFilters(task)),
    );
    applyProjectsTaskChange({
      previousTask,
      nextTask: updatedTask,
    });
    setSelectedTask((currentTask) => (currentTask?.id === listTask.id ? listTask : currentTask));
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    void loadTasks();
  }, [searchQuery, hasTimeOnly, selectedProjectFilter]);

  useEffect(() => {
    void loadProjects();
  }, []);

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

    const previousTask = tasks.find((task) => task.id === taskId) ?? null;
    if (previousTask?.is_completed) {
      setError("Нельзя запустить таймер для завершённой задачи");
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
      setError("Не удалось запустить таймер");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleStop(taskId: number) {
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
      setError("Не удалось остановить таймер");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleToggleCompleted(task: Task) {
    if (activeTimers[task.id] || getActiveInterval(task)) {
      setError("Сначала остановите таймер");
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
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось обновить задачу");
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
      const previousTask = tasks.find((task) => task.id === taskId) ?? null;
      await deleteTask(taskId);
      setSelectedTask((currentTask) => (currentTask?.id === taskId ? null : currentTask));
      setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
      if (previousTask) {
        applyProjectsTaskChange({
          previousTask,
          nextTask: null,
        });
      }
      setActiveTimers((currentTimers) => {
        const nextTimers = { ...currentTimers };
        delete nextTimers[taskId];
        return nextTimers;
      });
    } catch {
      setError("Не удалось удалить задачу");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);

    if (!newTitle.trim()) {
      setCreateError("Введите название задачи");
      return;
    }

    try {
      const createdTask = keepActiveIntervalsOnly(
        await createTask({
          title: newTitle,
          description: newDescription || null,
          deadline: newDeadline || null,
          priority: newPriority,
          project_id: newProjectId === "none" ? null : Number(newProjectId),
        }),
      );
      if (taskMatchesCurrentFilters(createdTask)) {
        setTasks((currentTasks) => [createdTask, ...currentTasks].slice(0, TASKS_PAGE_LIMIT));
      }
      applyProjectsTaskChange({
        previousTask: null,
        nextTask: createdTask,
      });
      setNewTitle("");
      setNewDescription("");
      setNewDeadline("");
      setNewPriority("medium");
      setNewProjectId(getDefaultProjectForCreate());
      setIsCreateOpen(false);
    } catch {
      setCreateError("Не удалось создать задачу");
    }
  }

  return (
    <main className="dashboard-page app-container">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Рабочий экран</p>
          <h1 className="page-heading">Focus Timer First</h1>
          <p className="page-copy">Запускайте таймер на задаче, держите очередь под рукой и сохраняйте ровный темп работы.</p>
        </div>
        <button className="button button--green dashboard-hero__button" type="button" onClick={openCreateTask}>
          Создать задачу
        </button>
      </section>

      {error && <div className="status-message status-message--error dashboard-status">{error}</div>}

      <section className="dashboard-grid">
        <TimerCard
          activeTask={activeTask}
          elapsedTime={activeTask ? getTaskDisplaySeconds(activeTask) : 0}
          activeCount={activeTimerEntries.length}
          isStopping={Boolean(activeTask && busyTaskId === activeTask.id)}
          onStop={() => activeTask && void handleStop(activeTask.id)}
        />

        <section className="tasks-queue">
          <div className="tasks-queue__header">
            <div>
              <p className="tasks-queue__label">Очередь задач</p>
              <h2>Задачи</h2>
            </div>
            <label className="tasks-queue__toggle">
              <input type="checkbox" checked={hasTimeOnly} onChange={(event) => setHasTimeOnly(event.target.checked)} />
              Только с временем
            </label>
          </div>

          <div className="tasks-queue__tools">
            <input
              className="text-field"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Поиск по названию"
            />
            <select
              className="text-field tasks-queue__project-filter"
              value={selectedProjectFilter}
              onChange={(event) => setSelectedProjectFilter(event.target.value)}
              aria-label="Фильтр по проекту"
            >
              <option value="all">Все проекты</option>
              <option value="none">Без проекта</option>
              {projects.map((project) => (
                <option key={project.id} value={String(project.id)}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {isCreateOpen && (
            <form className="task-create" onSubmit={handleCreateTask}>
              <label className="task-create__field task-create__field--full">
                <span>Название</span>
                <input
                  className="text-field"
                  type="text"
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="Название задачи"
                />
              </label>
              <label className="task-create__field task-create__field--full">
                <span>Описание</span>
                <textarea
                  className="textarea-field"
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                  placeholder="Описание"
                />
              </label>
              <div className="task-create__row">
                <label className="task-create__field">
                  <span>Срок выполнения</span>
                  <input
                    className="text-field"
                    type="date"
                    value={newDeadline}
                    onChange={(event) => setNewDeadline(event.target.value)}
                  />
                </label>
                <label className="task-create__field">
                  <span>Приоритет</span>
                  <PrioritySelect value={newPriority} onChange={setNewPriority} />
                </label>
                <label className="task-create__field">
                  <span>Проект</span>
                  <select
                    className="text-field"
                    value={newProjectId}
                    onChange={(event) => setNewProjectId(event.target.value)}
                  >
                    <option value="none">Без проекта</option>
                    {projects.map((project) => (
                      <option key={project.id} value={String(project.id)}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {createError && <p className="task-create__error">{createError}</p>}
              <div className="task-create__actions">
                <button className="button button--green" type="submit">
                  Добавить
                </button>
                <button className="button" type="button" onClick={() => setIsCreateOpen(false)}>
                  Отмена
                </button>
              </div>
            </form>
          )}

          <div className="tasks-queue__list">
            {isLoading ? (
              <div className="status-message">Загружаем задачи...</div>
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
                  />
                );
              })
            ) : (
              <div className="tasks-empty">
                <h3>Задач пока нет</h3>
                <p>Создайте первую задачу, чтобы запустить таймер.</p>
                <button className="button button--green" type="button" onClick={openCreateTask}>
                  Создать первую задачу
                </button>
              </div>
            )}
          </div>
        </section>
      </section>

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
