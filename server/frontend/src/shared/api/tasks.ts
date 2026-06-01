import { apiRequest, USE_MOCKS } from "./client";
import { mockTasks } from "./mockData";
import type { CreateTaskRequest, Task, TaskQuery, UpdateTaskRequest } from "../types/task";

const tasksStore: Task[] = mockTasks.map((task) => ({ ...task, time_intervals: [...(task.time_intervals ?? [])] }));

function serializeQuery(query: TaskQuery = {}): string {
  const params = new URLSearchParams();

  if (query.search) {
    params.set("search", query.search);
  }

  if (query.hasTime) {
    params.set("has_time", "true");
  }

  if (query.priority) {
    params.set("priority", query.priority);
  }

  if (query.deadlineBefore) {
    params.set("deadline_before", query.deadlineBefore);
  }

  if (query.deadlineAfter) {
    params.set("deadline_after", query.deadlineAfter);
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
      const matchesPriority = !query.priority || task.priority === query.priority;
      const matchesDeadlineBefore =
        !query.deadlineBefore || Boolean(task.deadline && task.deadline <= query.deadlineBefore);
      const matchesDeadlineAfter =
        !query.deadlineAfter || Boolean(task.deadline && task.deadline >= query.deadlineAfter);
      return matchesSearch && matchesTime && matchesPriority && matchesDeadlineBefore && matchesDeadlineAfter;
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
      deadline: payload.deadline || null,
      priority: payload.priority ?? "medium",
      created_at: new Date().toISOString(),
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
    const now = new Date().toISOString();
    const task = tasksStore.find((item) => item.id === taskId);

    if (!task) {
      throw new Error("Задача не найдена");
    }

    if (task.time_intervals?.some((interval) => interval.ended_at === null)) {
      return task;
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

export async function deleteTask(taskId: number): Promise<void> {
  if (USE_MOCKS) {
    const taskIndex = tasksStore.findIndex((task) => task.id === taskId);

    if (taskIndex === -1) {
      throw new Error("Задача не найдена");
    }

    tasksStore.splice(taskIndex, 1);
    return;
  }

  return apiRequest<void>(`/api/v1/tasks/${taskId}`, {
    method: "DELETE",
  });
}

export async function updateTask(taskId: number, payload: UpdateTaskRequest): Promise<Task> {
  if (USE_MOCKS) {
    const task = tasksStore.find((item) => item.id === taskId);

    if (!task) {
      throw new Error("Задача не найдена");
    }

    if (payload.title !== undefined) {
      task.title = payload.title.trim();
    }

    if (payload.description !== undefined) {
      task.description = payload.description?.trim() || null;
    }

    if (payload.deadline !== undefined) {
      task.deadline = payload.deadline || null;
    }

    if (payload.priority !== undefined) {
      task.priority = payload.priority;
    }

    return task;
  }

  return apiRequest<Task>(`/api/v1/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
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
