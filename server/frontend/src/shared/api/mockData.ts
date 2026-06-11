import type { Task } from "../types/task";
import type { ProjectListItem } from "../types/project";
import type { ActivityDay, ActivityResponse, SummaryResponse } from "../types/reports";
import type { User } from "../types/user";
import { getActivityLevel } from "../utils/activity";

const now = new Date();
const activeStartedAt = new Date(now.getTime() - 42 * 60 * 1000).toISOString();

export const mockUser: User = {
  id: 1,
  email: "oleg@example.com",
  username: "oleg",
  full_name: "Олег",
  role: "user",
  is_active: true,
  avatar_letter: "О",
  created_at: "2024-03-14T09:20:00.000Z",
  stats: {
    tasks_count: 8,
    tasks_with_time_count: 6,
    total_time_seconds: 162420,
    current_streak_days: 6,
    max_streak_days: 18,
  },
};

export const mockProjects: ProjectListItem[] = [
  {
    id: 1,
    name: "Разработка backend",
    description: "API, база данных и инфраструктурные задачи",
    color: "#1f6feb",
    is_archived: false,
    created_at: "2026-05-20T08:00:00.000Z",
    updated_at: "2026-05-20T08:00:00.000Z",
    tasks_count: 2,
    active_tasks_count: 1,
    tasks_with_time_count: 2,
    total_time_seconds: 46020,
  },
  {
    id: 2,
    name: "Интерфейс",
    description: "Экран таймера, отчёты и адаптация",
    color: "#2ea043",
    is_archived: false,
    created_at: "2026-05-21T09:15:00.000Z",
    updated_at: "2026-05-21T09:15:00.000Z",
    tasks_count: 2,
    active_tasks_count: 0,
    tasks_with_time_count: 1,
    total_time_seconds: 18420,
  },
  {
    id: 3,
    name: "Деплой проекта",
    description: "Production, мониторинг и проверка релизов",
    color: "#f0883e",
    is_archived: false,
    created_at: "2026-05-22T10:30:00.000Z",
    updated_at: "2026-05-22T10:30:00.000Z",
    tasks_count: 1,
    active_tasks_count: 0,
    tasks_with_time_count: 1,
    total_time_seconds: 8520,
  },
];

export const mockTasks: Task[] = [
  {
    id: 1,
    title: "Сверстать dashboard таймера",
    description: "Две ровные колонки, активная задача и очередь задач",
    total_time_seconds: 18420,
    deadline: "2026-05-30",
    priority: "high",
    project_id: 2,
    project: {
      id: 2,
      name: "Интерфейс",
      color: "#2ea043",
    },
    created_at: "2026-05-24T08:30:00.000Z",
    time_intervals: [
      {
        id: 101,
        started_at: activeStartedAt,
        ended_at: null,
      },
    ],
  },
  {
    id: 2,
    title: "Подготовить activity grid",
    description: "CSS Grid 53 недели на 7 дней, GitHub-like легенда",
    total_time_seconds: 27600,
    deadline: "2026-06-02",
    priority: "highest",
    project_id: 1,
    project: {
      id: 1,
      name: "Разработка backend",
      color: "#1f6feb",
    },
    created_at: "2026-05-24T10:10:00.000Z",
    time_intervals: [],
  },
  {
    id: 3,
    title: "Собрать страницу отчётов",
    description: "Карточки, недельный график и топ задач",
    total_time_seconds: 13480,
    deadline: null,
    priority: "medium",
    project_id: 1,
    project: {
      id: 1,
      name: "Разработка backend",
      color: "#1f6feb",
    },
    created_at: "2026-05-25T13:40:00.000Z",
    time_intervals: [],
  },
  {
    id: 4,
    title: "Проверить мобильную адаптацию",
    description: "390px без наложений и лишнего горизонтального скролла",
    total_time_seconds: 0,
    deadline: "2026-06-07",
    priority: "low",
    project_id: null,
    project: null,
    created_at: "2026-05-26T11:15:00.000Z",
    time_intervals: [],
  },
  {
    id: 5,
    title: "Подключить будущий API слой",
    description: "Оставить моки, но сохранить контракт fetch-клиента",
    total_time_seconds: 8520,
    deadline: null,
    priority: "lowest",
    project_id: 3,
    project: {
      id: 3,
      name: "Деплой проекта",
      color: "#f0883e",
    },
    created_at: "2026-05-27T16:25:00.000Z",
    time_intervals: [],
  },
];

function buildActivityDays(year: number): ActivityDay[] {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  const days: ActivityDay[] = [];

  for (let time = start.getTime(); time <= end.getTime(); time += 24 * 60 * 60 * 1000) {
    const date = new Date(time);
    const dayOfYear = Math.floor((time - start.getTime()) / (24 * 60 * 60 * 1000));
    const weekday = date.getUTCDay();
    const base = (dayOfYear * 17 + year + weekday * 13) % 11;
    const isActive = weekday !== 0 && weekday !== 6 && base > 2;
    const total_time_seconds = isActive ? ((base % 5) + 1) * 28 * 60 + (dayOfYear % 4) * 720 : 0;

    days.push({
      date: date.toISOString().slice(0, 10),
      intervals_count: total_time_seconds > 0 ? (base % 3) + 1 : 0,
      total_time_seconds,
      level: getActivityLevel(total_time_seconds),
    });
  }

  return days;
}

export const mockActivityDays = buildActivityDays(2026);

export function getMockActivity(year: number): ActivityResponse {
  const days = buildActivityDays(year);
  const activeDays = days.filter((day) => day.total_time_seconds > 0);
  const total_time_seconds = days.reduce((sum, day) => sum + day.total_time_seconds, 0);
  const total_intervals_count = days.reduce((sum, day) => sum + day.intervals_count, 0);

  return {
    days,
    summary: {
      active_days_count: activeDays.length,
      current_streak_days: year === 2026 ? 6 : 0,
      max_streak_days: year === 2026 ? 18 : 12,
      total_intervals_count,
      total_time_seconds,
    },
  };
}

export const mockSummary: SummaryResponse = {
  total_time_seconds_all_tasks: mockTasks.reduce((sum, task) => sum + task.total_time_seconds, 0),
  tasks_with_time_count: mockTasks.filter((task) => task.total_time_seconds > 0).length,
  top_tasks: mockTasks
    .filter((task) => task.total_time_seconds > 0)
    .sort((a, b) => b.total_time_seconds - a.total_time_seconds)
    .slice(0, 5)
    .map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      total_time_seconds: task.total_time_seconds,
      deadline: task.deadline,
      priority: task.priority,
    })),
};
