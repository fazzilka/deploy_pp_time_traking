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
  top_tasks: Array<{
    id: number;
    title: string;
    total_time_seconds: number;
  }>;
};
