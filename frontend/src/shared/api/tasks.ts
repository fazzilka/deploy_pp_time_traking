import { apiRequest, USE_MOCKS } from "./client";
import { mockTasks } from "./mockData";
import type { CreateTaskRequest, Task, TaskQuery } from "../types/task";

const tasksStore: Task[] = mockTasks.map((task) => ({ ...task, time_intervals: [...(task.time_intervals ?? [])] }));

function findActiveTask(): Task | undefined {
  return tasksStore.find((task) => task.time_intervals?.some((interval) => interval.ended_at === null));
}

function serializeQuery(query: TaskQuery = {}): string {
  const params = new URLSearchParams();

  if (query.search) {
    params.set("search", query.search);
  }

  if (query.hasTime) {
    params.set("has_time", "true");
  }

  const search = params.toString();
  return search ? `?${search}` : "";
}

export async function getTasks(query: TaskQuery = {}): Promise<Task[]> {
  if (USE_MOCKS) {
    const search = query.search?.trim().toLowerCase();

    return tasksStore.filter((task) => {
      const matchesSearch = !search || task.title.toLowerCase().includes(search);
      const matchesTime = !query.hasTime || task.total_time_seconds > 0;
      return matchesSearch && matchesTime;
    });
  }

  return apiRequest<Task[]>(`/api/v1/tasks${serializeQuery(query)}`);
}

export async function createTask(payload: CreateTaskRequest): Promise<Task> {
  if (USE_MOCKS) {
    const task: Task = {
      id: Math.max(...tasksStore.map((item) => item.id), 0) + 1,
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      total_time_seconds: 0,
      time_intervals: [],
    };

    tasksStore.unshift(task);
    return task;
  }

  return apiRequest<Task>("/api/v1/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function startTaskTimer(taskId: number): Promise<Task> {
  if (USE_MOCKS) {
    const currentActive = findActiveTask();
    const now = new Date().toISOString();

    if (currentActive) {
      const activeInterval = currentActive.time_intervals?.find((interval) => interval.ended_at === null);

      if (activeInterval) {
        activeInterval.ended_at = now;
        currentActive.total_time_seconds += Math.floor(
          (new Date(activeInterval.ended_at).getTime() - new Date(activeInterval.started_at).getTime()) / 1000,
        );
      }
    }

    const task = tasksStore.find((item) => item.id === taskId);

    if (!task) {
      throw new Error("Задача не найдена");
    }

    task.time_intervals = [
      ...(task.time_intervals ?? []),
      {
        id: Date.now(),
        started_at: now,
        ended_at: null,
      },
    ];

    return task;
  }

  return apiRequest<Task>(`/api/v1/tasks/${taskId}/timer/start`, {
    method: "POST",
  });
}

export async function stopTaskTimer(taskId: number): Promise<Task> {
  if (USE_MOCKS) {
    const task = tasksStore.find((item) => item.id === taskId);
    const activeInterval = task?.time_intervals?.find((interval) => interval.ended_at === null);

    if (!task || !activeInterval) {
      throw new Error("Активный таймер не найден");
    }

    activeInterval.ended_at = new Date().toISOString();
    task.total_time_seconds += Math.floor(
      (new Date(activeInterval.ended_at).getTime() - new Date(activeInterval.started_at).getTime()) / 1000,
    );

    return task;
  }

  return apiRequest<Task>(`/api/v1/tasks/${taskId}/timer/stop`, {
    method: "POST",
  });
}
