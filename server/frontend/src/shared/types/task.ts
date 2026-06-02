export type TimeInterval = {
  id: number;
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
  created_at?: string;
  updated_at?: string;
  time_intervals?: TimeInterval[];
};

export type CreateTaskRequest = {
  title: string;
  description?: string | null;
  deadline?: string | null;
  priority?: TaskPriority;
};

export type UpdateTaskRequest = {
  title?: string;
  description?: string | null;
  deadline?: string | null;
  priority?: TaskPriority;
};

export type TaskQuery = {
  search?: string;
  hasTime?: boolean;
  priority?: TaskPriority;
  deadlineBefore?: string;
  deadlineAfter?: string;
  limit?: number;
  offset?: number;
};
