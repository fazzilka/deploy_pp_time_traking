import { FormEvent, useEffect, useMemo, useState } from "react";
import { TaskRow } from "../../components/TaskRow/TaskRow";
import { TimerCard } from "../../components/TimerCard/TimerCard";
import { createTask, getTasks, startTaskTimer, stopTaskTimer } from "../../shared/api/tasks";
import type { Task } from "../../shared/types/task";
import "./DashboardPage.css";

function getActiveInterval(task: Task) {
  return task.time_intervals?.find((interval) => interval.ended_at === null) ?? null;
}

export function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasTimeOnly, setHasTimeOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [tick, setTick] = useState(Date.now());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const activeTask = useMemo(() => tasks.find((task) => getActiveInterval(task)) ?? null, [tasks]);

  async function loadTasks() {
    setIsLoading(true);
    setError(null);

    try {
      const nextTasks = await getTasks({
        search: searchQuery,
        hasTime: hasTimeOnly,
      });
      setTasks(nextTasks);
    } catch {
      setError("Не удалось загрузить задачи");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    void loadTasks();
  }, [searchQuery, hasTimeOnly]);

  useEffect(() => {
    if (!activeTask) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setTick(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeTask?.id]);

  function getTaskDisplaySeconds(task: Task): number {
    const activeInterval = getActiveInterval(task);

    if (!activeInterval) {
      return task.total_time_seconds;
    }

    return task.total_time_seconds + Math.max(0, Math.floor((tick - new Date(activeInterval.started_at).getTime()) / 1000));
  }

  async function handleStart(taskId: number) {
    setBusyTaskId(taskId);
    setError(null);

    try {
      await startTaskTimer(taskId);
      await loadTasks();
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
      await stopTaskTimer(taskId);
      await loadTasks();
    } catch {
      setError("Не удалось остановить таймер");
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
      await createTask({
        title: newTitle,
        description: newDescription || null,
      });
      setNewTitle("");
      setNewDescription("");
      setIsCreateOpen(false);
      await loadTasks();
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
        <button className="button button--green dashboard-hero__button" type="button" onClick={() => setIsCreateOpen(true)}>
          Создать задачу
        </button>
      </section>

      {error && <div className="status-message status-message--error dashboard-status">{error}</div>}

      <section className="dashboard-grid">
        <TimerCard
          activeTask={activeTask}
          elapsedTime={activeTask ? getTaskDisplaySeconds(activeTask) : 0}
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
          </div>

          {isCreateOpen && (
            <form className="task-create" onSubmit={handleCreateTask}>
              <input
                className="text-field"
                type="text"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="Название задачи"
              />
              <textarea
                className="textarea-field"
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder="Описание"
              />
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
                const isActive = activeTask?.id === task.id;

                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isActive={isActive}
                    displaySeconds={getTaskDisplaySeconds(task)}
                    isBusy={busyTaskId === task.id}
                    onStart={(taskId) => void handleStart(taskId)}
                    onStop={(taskId) => void handleStop(taskId)}
                  />
                );
              })
            ) : (
              <div className="tasks-empty">
                <h3>Задач пока нет</h3>
                <p>Создайте первую задачу, чтобы запустить таймер.</p>
                <button className="button button--green" type="button" onClick={() => setIsCreateOpen(true)}>
                  Создать первую задачу
                </button>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
