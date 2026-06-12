import type { Task, TaskPriority } from "./task";

export type Project = {
  id: number;
  name: string;
  description: string | null;
  color: string;
  icon?: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type ProjectBadge = {
  id: number;
  name: string;
  color: string;
  icon?: string | null;
};

export type ProjectListItem = Project & {
  tasks_count: number;
  active_tasks_count: number;
  tasks_with_time_count: number;
  total_time_seconds: number;
};

export type ProjectCreateRequest = {
  name: string;
  description?: string | null;
  color: string;
};

export type ProjectUpdateRequest = {
  name?: string;
  description?: string | null;
  color?: string;
  is_archived?: boolean;
};

export type ProjectSummaryTask = {
  id: number;
  title: string;
  description: string | null;
  total_time_seconds: number;
  deadline: string | null;
  priority: TaskPriority;
};

export type ProjectSummary = Project & {
  tasks_count: number;
  active_tasks_count: number;
  tasks_with_time_count: number;
  total_time_seconds: number;
  top_tasks: ProjectSummaryTask[];
};

export type ProjectTimeSummaryItem = {
  project_id: number | null;
  name: string;
  color: string;
  tasks_count: number;
  active_tasks_count: number;
  total_time_seconds: number;
  percentage: number;
};

export type ProjectsTimeSummaryResponse = {
  items: ProjectTimeSummaryItem[];
  total_time_seconds: number;
};

export type ProjectTask = Task;
