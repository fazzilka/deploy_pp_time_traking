import { apiRequest, USE_MOCKS } from "./client";

export type NotificationType =
  | "deadline_soon"
  | "deadline_overdue"
  | "workspace_member_added"
  | "workspace_member_removed"
  | "workspace_member_role_changed";

export type NotificationItem = {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  payload: Record<string, unknown> | null;
  workspace_id: number | null;
  task_id: number | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
};

export type NotificationListResponse = {
  items: NotificationItem[];
  total: number;
  unread_count: number;
};

export type NotificationUnreadCountResponse = {
  unread_count: number;
};

export type MarkAllNotificationsReadResponse = {
  updated_count: number;
};

const mockNotifications: NotificationItem[] = [
  {
    id: 1,
    type: "deadline_soon",
    title: "Дедлайн скоро закончится",
    message: "До дедлайна задачи «Сверстать dashboard таймера» осталось меньше 60 минут.",
    payload: {
      event: "deadline_soon",
      task_id: 1,
      task_title: "Сверстать dashboard таймера",
      remind_before_minutes: 60,
    },
    workspace_id: 1,
    task_id: 1,
    is_read: false,
    created_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    read_at: null,
  },
  {
    id: 2,
    type: "workspace_member_added",
    title: "Вас добавили в рабочее пространство",
    message: "Вас добавили в рабочее пространство «Команда разработки».",
    payload: {
      event: "member_added",
      workspace_id: 2,
      workspace_name: "Команда разработки",
    },
    workspace_id: 2,
    task_id: null,
    is_read: true,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    read_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
  },
];

export async function getNotifications({
  limit = 20,
  offset = 0,
  unreadOnly = false,
}: {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
} = {}): Promise<NotificationListResponse> {
  if (USE_MOCKS) {
    const filtered = unreadOnly
      ? mockNotifications.filter((notification) => !notification.is_read)
      : mockNotifications;
    return {
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
      unread_count: mockNotifications.filter((notification) => !notification.is_read).length,
    };
  }

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    unread_only: String(unreadOnly),
  });
  return apiRequest<NotificationListResponse>(`/api/v1/notifications?${params.toString()}`);
}

export async function getUnreadNotificationsCount(): Promise<NotificationUnreadCountResponse> {
  if (USE_MOCKS) {
    return {
      unread_count: mockNotifications.filter((notification) => !notification.is_read).length,
    };
  }

  return apiRequest<NotificationUnreadCountResponse>("/api/v1/notifications/unread-count");
}

export async function markNotificationRead(id: number): Promise<NotificationItem> {
  if (USE_MOCKS) {
    const notification = mockNotifications.find((item) => item.id === id);
    if (!notification) {
      throw new Error("Уведомление не найдено");
    }
    notification.is_read = true;
    notification.read_at = notification.read_at ?? new Date().toISOString();
    return notification;
  }

  return apiRequest<NotificationItem>(`/api/v1/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export async function markAllNotificationsRead(): Promise<MarkAllNotificationsReadResponse> {
  if (USE_MOCKS) {
    let updated_count = 0;
    const readAt = new Date().toISOString();
    mockNotifications.forEach((notification) => {
      if (!notification.is_read) {
        updated_count += 1;
        notification.is_read = true;
        notification.read_at = readAt;
      }
    });
    return { updated_count };
  }

  return apiRequest<MarkAllNotificationsReadResponse>("/api/v1/notifications/read-all", {
    method: "PATCH",
  });
}
