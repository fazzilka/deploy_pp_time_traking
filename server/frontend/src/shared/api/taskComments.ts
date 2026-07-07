import { apiRequest, USE_MOCKS } from "./client";
import type { TaskComment, TaskCommentsPage } from "../types/taskComment";

const COMMENT_LIMIT = 30;
const commentsCache = new Map<string, TaskCommentsPage>();
const pendingRequests = new Map<string, Promise<TaskCommentsPage>>();

function cacheKey(workspaceId: number | null | undefined, taskId: number, cursor?: string | null): string {
  return `task-comments:${workspaceId ?? "unknown"}:${taskId}:${cursor ?? "first"}`;
}

function buildQuery(limit: number, cursor?: string | null): string {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor) {
    params.set("cursor", cursor);
  }
  return `?${params.toString()}`;
}

export function getCachedTaskComments(
  workspaceId: number | null | undefined,
  taskId: number,
  cursor?: string | null,
): TaskCommentsPage | null {
  return commentsCache.get(cacheKey(workspaceId, taskId, cursor)) ?? null;
}

export function updateCachedTaskComments(
  workspaceId: number | null | undefined,
  taskId: number,
  updater: (current: TaskCommentsPage | null) => TaskCommentsPage | null,
): void {
  const key = cacheKey(workspaceId, taskId);
  const next = updater(commentsCache.get(key) ?? null);
  if (next) {
    commentsCache.set(key, next);
  } else {
    commentsCache.delete(key);
  }
}

export function invalidateTaskComments(workspaceId: number | null | undefined, taskId: number): void {
  commentsCache.delete(cacheKey(workspaceId, taskId));
  pendingRequests.delete(cacheKey(workspaceId, taskId));
}

export function clearTaskCommentsCacheForWorkspace(workspaceId: number): void {
  const prefix = `task-comments:${workspaceId}:`;
  for (const key of commentsCache.keys()) {
    if (key.startsWith(prefix)) {
      commentsCache.delete(key);
    }
  }
  for (const key of pendingRequests.keys()) {
    if (key.startsWith(prefix)) {
      pendingRequests.delete(key);
    }
  }
}

export async function getTaskComments(options: {
  taskId: number;
  workspaceId?: number | null;
  cursor?: string | null;
  limit?: number;
  force?: boolean;
}): Promise<TaskCommentsPage> {
  const limit = options.limit ?? COMMENT_LIMIT;
  const key = cacheKey(options.workspaceId, options.taskId, options.cursor);
  if (!options.force) {
    const cached = commentsCache.get(key);
    if (cached) {
      return cached;
    }
    const pending = pendingRequests.get(key);
    if (pending) {
      return pending;
    }
  }

  if (USE_MOCKS) {
    const page: TaskCommentsPage = { items: [], total_active: 0, limit, next_cursor: null };
    commentsCache.set(key, page);
    return page;
  }

  const request = apiRequest<TaskCommentsPage>(
    `/api/v1/tasks/${options.taskId}/comments${buildQuery(limit, options.cursor)}`,
  ).then((page) => {
    commentsCache.set(key, page);
    return page;
  }).finally(() => {
    pendingRequests.delete(key);
  });
  pendingRequests.set(key, request);
  return request;
}

export async function createTaskComment(taskId: number, body: string): Promise<TaskComment> {
  const comment = await apiRequest<TaskComment>(`/api/v1/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  updateCachedTaskComments(comment.workspace_id, taskId, (current) => {
    if (!current) {
      return current;
    }
    return {
      ...current,
      items: [...current.items.filter((item) => item.id !== comment.id), comment],
      total_active: current.total_active + (comment.is_deleted ? 0 : 1),
    };
  });
  return comment;
}

export async function updateTaskComment(taskId: number, commentId: number, body: string): Promise<TaskComment> {
  const comment = await apiRequest<TaskComment>(`/api/v1/tasks/${taskId}/comments/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
  updateCachedTaskComments(comment.workspace_id, taskId, (current) => {
    if (!current) {
      return current;
    }
    return { ...current, items: current.items.map((item) => (item.id === comment.id ? comment : item)) };
  });
  return comment;
}

export async function deleteTaskComment(taskId: number, commentId: number): Promise<TaskComment> {
  const comment = await apiRequest<TaskComment>(`/api/v1/tasks/${taskId}/comments/${commentId}`, {
    method: "DELETE",
  });
  updateCachedTaskComments(comment.workspace_id, taskId, (current) => {
    if (!current) {
      return current;
    }
    const wasActive = current.items.some((item) => item.id === comment.id && !item.is_deleted);
    return {
      ...current,
      items: current.items.map((item) => (item.id === comment.id ? comment : item)),
      total_active: Math.max(0, current.total_active - (wasActive ? 1 : 0)),
    };
  });
  return comment;
}
