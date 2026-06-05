import type { TaskPriority } from "./task";

export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

export type ActivityDay = {
  date: string;
  intervals_count: number;
  total_time_seconds: number;
  level: ActivityLevel;
};

export type ActivityResponse = {
  days: ActivityDay[];
  summary: {
    active_days_count: number;
    current_streak_days: number;
    max_streak_days: number;
    total_intervals_count: number;
    total_time_seconds: number;
  };
};

export type SummaryResponse = {
  total_time_seconds_all_tasks: number;
  tasks_with_time_count: number;
  top_tasks: Array<{
    id: number;
    title: string;
    description: string | null;
    total_time_seconds: number;
    deadline: string | null;
    priority: TaskPriority;
  }>;
};
