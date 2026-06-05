import { apiRequest, USE_MOCKS } from "./client";
import { getTasks } from "./tasks";
import { getUserActivity } from "./profile";
import type { ActivityResponse, SummaryResponse } from "../types/reports";

const pendingSummaryRequests = new Map<string, Promise<SummaryResponse>>();

export async function getSummary(limit?: number): Promise<SummaryResponse> {
  if (USE_MOCKS) {
    const tasks = await getTasks();
    const topTasksLimit = limit ?? 5;

    return {
      total_time_seconds_all_tasks: tasks.reduce((sum, task) => sum + task.total_time_seconds, 0),
      tasks_with_time_count: tasks.filter((task) => task.total_time_seconds > 0).length,
      top_tasks: tasks
        .filter((task) => task.total_time_seconds > 0)
        .sort((a, b) => b.total_time_seconds - a.total_time_seconds)
        .slice(0, topTasksLimit)
        .map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          total_time_seconds: task.total_time_seconds,
          deadline: task.deadline,
          priority: task.priority,
        })),
    };
  }

  const path = `/api/v1/summary${limit ? `?limit=${limit}` : ""}`;
  const pendingRequest = pendingSummaryRequests.get(path);

  if (pendingRequest) {
    return pendingRequest;
  }

  const request = apiRequest<SummaryResponse>(path).finally(() => {
    pendingSummaryRequests.delete(path);
  });
  pendingSummaryRequests.set(path, request);
  return request;
}

export async function getReportsData(year: number): Promise<{
  summary: SummaryResponse;
  activity: ActivityResponse;
}> {
  const [summary, activity] = await Promise.all([getSummary(3), getUserActivity(year)]);

  return {
    summary,
    activity,
  };
}
