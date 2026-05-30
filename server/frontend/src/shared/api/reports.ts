import { apiRequest, USE_MOCKS } from "./client";
import { mockSummary } from "./mockData";
import { getTasks } from "./tasks";
import { getUserActivity } from "./profile";
import type { ActivityResponse, SummaryResponse } from "../types/reports";
import type { Task } from "../types/task";

export async function getSummary(): Promise<SummaryResponse> {
  if (USE_MOCKS) {
    const tasks = await getTasks();

    return {
      total_time_seconds_all_tasks: tasks.reduce((sum, task) => sum + task.total_time_seconds, 0),
      top_tasks: tasks
        .filter((task) => task.total_time_seconds > 0)
        .sort((a, b) => b.total_time_seconds - a.total_time_seconds)
        .slice(0, 5)
        .map((task) => ({
          id: task.id,
          title: task.title,
          total_time_seconds: task.total_time_seconds,
          deadline: task.deadline,
          priority: task.priority,
        })),
    };
  }

  return apiRequest<SummaryResponse>("/api/v1/summary");
}

export async function getReportsData(year: number): Promise<{
  summary: SummaryResponse;
  tasks: Task[];
  activity: ActivityResponse;
}> {
  const [summary, tasks, activity] = await Promise.all([getSummary(), getTasks(), getUserActivity(year)]);

  return {
    summary: summary.top_tasks.length > 0 ? summary : mockSummary,
    tasks,
    activity,
  };
}
