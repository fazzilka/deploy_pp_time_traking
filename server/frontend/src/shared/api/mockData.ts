import type { Task } from "../types/task";
import type { ProjectListItem } from "../types/project";
import type { ActivityDay, ActivityResponse, SummaryResponse } from "../types/reports";
import type { User } from "../types/user";
import type { Workspace, WorkspaceMember, WorkspaceMemberSummaryItem } from "../types/workspace";
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
    workspace_id: 1,
    name: "Разработка backend",
    description: "API, база данных и инфраструктурные задачи",
    color: "#1f6feb",
    icon: "code",
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
    workspace_id: 1,
    name: "Интерфейс",
    description: "Экран таймера, отчёты и адаптация",
    color: "#2ea043",
    icon: "pencil",
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
    workspace_id: 1,
    name: "Деплой проекта",
    description: "Production, мониторинг и проверка релизов",
    color: "#f0883e",
    icon: "rocket",
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
    workspace_id: 1,
    project_id: 2,
    project: {
      id: 2,
      name: "Интерфейс",
      color: "#2ea043",
      icon: "pencil",
    },
    is_completed: false,
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
    workspace_id: 1,
    project_id: 1,
    project: {
      id: 1,
      name: "Разработка backend",
      color: "#1f6feb",
      icon: "code",
    },
    is_completed: true,
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
    workspace_id: 1,
    project_id: 1,
    project: {
      id: 1,
      name: "Разработка backend",
      color: "#1f6feb",
      icon: "code",
    },
    is_completed: false,
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
    workspace_id: 1,
    project_id: null,
    project: null,
    is_completed: false,
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
    workspace_id: 1,
    project_id: 3,
    project: {
      id: 3,
      name: "Деплой проекта",
      color: "#f0883e",
      icon: "rocket",
    },
    is_completed: false,
    created_at: "2026-05-27T16:25:00.000Z",
    time_intervals: [],
  },
];

export const mockWorkspaces: Workspace[] = [
  {
    id: 1,
    name: "Личное пространство",
    description: "Персональные проекты и задачи",
    type: "personal",
    owner_id: 1,
    created_at: "2026-05-20T08:00:00.000Z",
    updated_at: "2026-05-20T08:00:00.000Z",
    members_count: 1,
    projects_count: mockProjects.length,
    tasks_count: mockTasks.length,
    total_time_seconds: mockTasks.reduce((sum, task) => sum + task.total_time_seconds, 0),
    current_user_role: "owner",
  },
  {
    id: 2,
    name: "Команда разработки",
    description: "Общее пространство команды продукта",
    type: "team",
    owner_id: 1,
    created_at: "2026-06-01T08:00:00.000Z",
    updated_at: "2026-06-01T08:00:00.000Z",
    members_count: 3,
    projects_count: 0,
    tasks_count: 0,
    total_time_seconds: 0,
    current_user_role: "owner",
  },
];

export const mockWorkspaceMembers: WorkspaceMember[] = [
  {
    id: 1,
    workspace_id: 1,
    user: {
      id: 1,
      email: mockUser.email,
      username: mockUser.username,
      full_name: mockUser.full_name,
      avatar_letter: mockUser.avatar_letter,
      is_active: true,
    },
    role: "owner",
    status: "active",
    joined_at: "2026-05-20T08:00:00.000Z",
    projects_count: mockProjects.length,
    tasks_count: mockTasks.length,
    completed_tasks_count: mockTasks.filter((task) => task.is_completed).length,
    total_time_seconds: mockTasks.reduce((sum, task) => sum + task.total_time_seconds, 0),
  },
  {
    id: 2,
    workspace_id: 2,
    user: {
      id: 1,
      email: mockUser.email,
      username: mockUser.username,
      full_name: mockUser.full_name,
      avatar_letter: mockUser.avatar_letter,
      is_active: true,
    },
    role: "owner",
    status: "active",
    joined_at: "2026-06-01T08:00:00.000Z",
    projects_count: 0,
    tasks_count: 0,
    completed_tasks_count: 0,
    total_time_seconds: 0,
  },
  {
    id: 3,
    workspace_id: 2,
    user: {
      id: 2,
      email: "teamlead@example.com",
      username: "teamlead",
      full_name: "Team Lead",
      avatar_letter: "T",
      is_active: true,
    },
    role: "team_lead",
    status: "active",
    joined_at: "2026-06-02T09:00:00.000Z",
    projects_count: 0,
    tasks_count: 0,
    completed_tasks_count: 0,
    total_time_seconds: 0,
  },
  {
    id: 4,
    workspace_id: 2,
    user: {
      id: 3,
      email: "member@example.com",
      username: "member",
      full_name: "Member",
      avatar_letter: "M",
      is_active: true,
    },
    role: "member",
    status: "active",
    joined_at: "2026-06-03T10:00:00.000Z",
    projects_count: 0,
    tasks_count: 0,
    completed_tasks_count: 0,
    total_time_seconds: 0,
  },
];

export const mockWorkspaceMemberSummary: WorkspaceMemberSummaryItem[] = mockWorkspaceMembers.map((member) => ({
  user: member.user,
  role: member.role,
  tasks_count: member.tasks_count,
  completed_tasks_count: member.completed_tasks_count,
  projects_count: member.projects_count,
  total_time_seconds: member.total_time_seconds,
}));

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
