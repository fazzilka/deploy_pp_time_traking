import { apiRequest, USE_MOCKS } from "./client";
import { getTasks } from "./tasks";
import { getUserActivity } from "./profile";
import { onTaskDataChanged } from "./cacheEvents";
import type { ActivityResponse, SummaryResponse } from "../types/reports";

const pendingSummaryRequests = new Map<string, Promise<SummaryResponse>>();
const summaryCache = new Map<string, { value: SummaryResponse; time: number }>();
const SUMMARY_TTL_MS = 15_000;

type CacheOptions = {
  force?: boolean;
};

function isFresh(cacheTime: number, ttlMs: number): boolean {
  return Date.now() - cacheTime < ttlMs;
}

export async function getSummary(limit?: number, options: CacheOptions = {}): Promise<SummaryResponse> {
  const path = `/api/v1/summary${limit ? `?limit=${limit}` : ""}`;

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

  const cachedSummary = summaryCache.get(path);
  if (!options.force && cachedSummary && isFresh(cachedSummary.time, SUMMARY_TTL_MS)) {
    return cachedSummary.value;
  }

  const pendingRequest = pendingSummaryRequests.get(path);

  if (!options.force && pendingRequest) {
    return pendingRequest;
  }

  const request = apiRequest<SummaryResponse>(path)
    .then((summary) => {
      summaryCache.set(path, { value: summary, time: Date.now() });
      return summary;
    })
    .finally(() => {
      pendingSummaryRequests.delete(path);
    });
  pendingSummaryRequests.set(path, request);
  return request;
}

export async function getReportsData(year: number, options: CacheOptions = {}): Promise<{
  summary: SummaryResponse;
  activity: ActivityResponse;
}> {
  const [summary, activity] = await Promise.all([getSummary(3, options), getUserActivity(year, options)]);

  return {
    summary,
    activity,
  };
}

export function invalidateReportsCache(): void {
  summaryCache.clear();
  pendingSummaryRequests.clear();
}

onTaskDataChanged(invalidateReportsCache);
