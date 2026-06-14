import type { ProjectBadge } from "./project";

export type TimeInterval = {
  id: number;
  user_id?: number | null;
  started_at: string;
  ended_at: string | null;
};

export type TaskPriority = "lowest" | "low" | "medium" | "high" | "highest";

export type Task = {
  id: number;
  title: string;
  description: string | null;
  total_time_seconds: number;
  deadline: string | null;
  priority: TaskPriority;
  workspace_id?: number | null;
  project_id?: number | null;
  created_by_id?: number | null;
  assignee_id?: number | null;
  project?: ProjectBadge | null;
  is_completed: boolean;
  created_at?: string;
  updated_at?: string;
  time_intervals?: TimeInterval[];
};

export type CreateTaskRequest = {
  title: string;
  description?: string | null;
  deadline?: string | null;
  priority?: TaskPriority;
  workspace_id?: number | null;
  project_id?: number | null;
  assignee_id?: number | null;
};

export type UpdateTaskRequest = {
  title?: string;
  description?: string | null;
  deadline?: string | null;
  priority?: TaskPriority;
  project_id?: number | null;
  assignee_id?: number | null;
  is_completed?: boolean;
};

export type TaskQuery = {
  search?: string;
  hasTime?: boolean;
  priority?: TaskPriority;
  workspaceId?: number;
  deadlineBefore?: string;
  deadlineAfter?: string;
  projectId?: number;
  withoutProject?: boolean;
  isCompleted?: boolean;
  limit?: number;
  offset?: number;
};
