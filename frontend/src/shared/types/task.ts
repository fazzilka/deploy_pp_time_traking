export type TimeInterval = {
  id: number;
  started_at: string;
  ended_at: string | null;
};

export type Task = {
  id: number;
  title: string;
  description: string | null;
  total_time_seconds: number;
  created_at?: string;
  updated_at?: string;
  time_intervals?: TimeInterval[];
};

export type CreateTaskRequest = {
  title: string;
  description: string | null;
};

export type TaskQuery = {
  search?: string;
  hasTime?: boolean;
};
