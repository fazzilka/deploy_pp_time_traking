import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import "./NotificationsBell.css";

type NotificationType =
  | "deadline_soon"
  | "deadline_overdue"
  | "workspace_member_added"
  | "workspace_member_removed"
  | "workspace_role_changed"
  | "workspace_member_role_changed"
  | string;

type NotificationPayload = Record<string, unknown> | null;

type NotificationItem = {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  payload?: NotificationPayload;
  workspace_id?: number | null;
  task_id?: number | null;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
};

type NotificationListResponse = {
  items: NotificationItem[];
  total?: number;
  unread_count?: number;
};

type NotificationUnreadCountResponse = {
  unread_count: number;
};

function BellIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </svg>
  );
}

function UserMinusIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 11h-6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function getNotificationIcon(type: NotificationType) {
  if (type === "deadline_soon") {
    return <CalendarIcon />;
  }

  if (type === "deadline_overdue") {
    return <AlertTriangleIcon />;
  }

  if (type === "workspace_member_added") {
    return <UserPlusIcon />;
  }

  if (type === "workspace_member_removed") {
    return <UserMinusIcon />;
  }

  if (type === "workspace_role_changed" || type === "workspace_member_role_changed") {
    return <ShieldIcon />;
  }

  return <InfoIcon />;
}

function getNotificationTone(type: NotificationType) {
  if (type === "deadline_soon") {
    return "deadline";
  }

  if (type === "deadline_overdue") {
    return "overdue";
  }

  if (type === "workspace_member_added") {
    return "success";
  }

  if (type === "workspace_member_removed") {
    return "blue";
  }

  if (type === "workspace_role_changed" || type === "workspace_member_role_changed") {
    return "warning";
  }

  return "neutral";
}

function getNotificationTitleFallback(type: NotificationType) {
  if (type === "deadline_soon") {
    return "Приближается дедлайн";
  }

  if (type === "deadline_overdue") {
    return "Дедлайн просрочен";
  }

  if (type === "workspace_member_added") {
    return "Приглашение в рабочее пространство";
  }

  if (type === "workspace_member_removed") {
    return "Вы удалены из пространства";
  }

  if (type === "workspace_role_changed" || type === "workspace_member_role_changed") {
    return "Изменена ваша роль";
  }

  return "Уведомление";
}

function normalizeNotificationsResponse(response: NotificationListResponse | NotificationItem[]): NotificationItem[] {
  if (Array.isArray(response)) {
    return response;
  }

  return response.items ?? [];
}

function normalizeUnreadCount(response: NotificationUnreadCountResponse): number {
  return Number.isFinite(response.unread_count) ? response.unread_count : 0;
}

function formatNotificationDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - targetDay.getTime()) / 86_400_000);

  const time = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (diffDays === 0) {
    return `Сегодня, ${time}`;
  }

  if (diffDays === 1) {
    return `Вчера, ${time}`;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function NotificationsBell() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badgeLabel = useMemo(() => {
    if (unreadCount <= 0) {
      return null;
    }

    return unreadCount > 99 ? "99+" : String(unreadCount);
  }, [unreadCount]);

  const loadUnreadCount = useCallback(async () => {
    try {
      const response = await apiRequest<NotificationUnreadCountResponse>("/api/v1/notifications/unread-count");
      setUnreadCount(normalizeUnreadCount(response));
    } catch {
      setUnreadCount(0);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest<NotificationListResponse | NotificationItem[]>(
        "/api/v1/notifications?limit=20&offset=0",
      );
      const nextItems = normalizeNotificationsResponse(response);
      setItems(nextItems);

      if (!Array.isArray(response) && typeof response.unread_count === "number") {
        setUnreadCount(response.unread_count);
      } else {
        void loadUnreadCount();
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Не удалось загрузить уведомления";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [loadUnreadCount]);

  useEffect(() => {
    void loadUnreadCount();

    const intervalId = window.setInterval(() => {
      void loadUnreadCount();
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadUnreadCount]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current) {
        return;
      }

      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function handleToggle() {
    const nextIsOpen = !isOpen;
    setIsOpen(nextIsOpen);

    if (nextIsOpen) {
      await loadNotifications();
    }
  }

  async function handleMarkAsRead(notification: NotificationItem) {
    if (notification.is_read) {
      return;
    }

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === notification.id ? { ...item, is_read: true, read_at: new Date().toISOString() } : item,
      ),
    );
    setUnreadCount((currentCount) => Math.max(0, currentCount - 1));

    try {
      const updatedNotification = await apiRequest<NotificationItem>(`/api/v1/notifications/${notification.id}/read`, {
        method: "PATCH",
      });

      setItems((currentItems) =>
        currentItems.map((item) => (item.id === notification.id ? { ...item, ...updatedNotification } : item)),
      );
    } catch {
      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === notification.id ? { ...item, is_read: notification.is_read, read_at: notification.read_at } : item,
        ),
      );
      setUnreadCount((currentCount) => currentCount + 1);
    }
  }

  async function handleMarkAllAsRead() {
    if (unreadCount <= 0 || isMarkingAll) {
      return;
    }

    setIsMarkingAll(true);

    const previousItems = items;
    const previousUnreadCount = unreadCount;

    setItems((currentItems) =>
      currentItems.map((item) => ({
        ...item,
        is_read: true,
        read_at: item.read_at ?? new Date().toISOString(),
      })),
    );
    setUnreadCount(0);

    try {
      await apiRequest("/api/v1/notifications/read-all", {
        method: "PATCH",
      });
    } catch {
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
    } finally {
      setIsMarkingAll(false);
    }
  }

  return (
    <div className="notifications-bell" ref={rootRef}>
      <button
        className={isOpen ? "notifications-bell__button notifications-bell__button--active" : "notifications-bell__button"}
        type="button"
        aria-label="Открыть уведомления"
        aria-expanded={isOpen}
        onClick={handleToggle}
      >
        <BellIcon />
        {badgeLabel ? <span className="notifications-bell__badge">{badgeLabel}</span> : null}
      </button>

      {isOpen ? (
        <div className="notifications-bell__dropdown" role="dialog" aria-label="Уведомления">
          <div className="notifications-bell__header">
            <h2 className="notifications-bell__title">Уведомления</h2>

            <button
              className="notifications-bell__mark-all"
              type="button"
              disabled={unreadCount <= 0 || isMarkingAll}
              onClick={handleMarkAllAsRead}
            >
              Отметить всё прочитанным
            </button>
          </div>

          <div className="notifications-bell__list">
            {isLoading ? <div className="notifications-bell__state">Загружаем уведомления...</div> : null}

            {!isLoading && error ? (
              <div className="notifications-bell__state notifications-bell__error">{error}</div>
            ) : null}

            {!isLoading && !error && items.length === 0 ? (
              <div className="notifications-bell__state">Уведомлений пока нет</div>
            ) : null}

            {!isLoading && !error
              ? items.map((notification) => {
                  const tone = getNotificationTone(notification.type);
                  const title = notification.title || getNotificationTitleFallback(notification.type);

                  return (
                    <button
                      key={notification.id}
                      className={
                        notification.is_read
                          ? `notifications-bell__item notifications-bell__item--${tone}`
                          : `notifications-bell__item notifications-bell__item--${tone} notifications-bell__item--unread`
                      }
                      type="button"
                      onClick={() => void handleMarkAsRead(notification)}
                    >
                      <span className={`notifications-bell__item-icon notifications-bell__item-icon--${tone}`}>
                        {getNotificationIcon(notification.type)}
                      </span>

                      <span className="notifications-bell__item-content">
                        <span className="notifications-bell__item-title">{title}</span>
                        <span className="notifications-bell__item-message">{notification.message}</span>
                      </span>

                      <span className="notifications-bell__item-meta">
                        <span className="notifications-bell__item-date">
                          {formatNotificationDate(notification.created_at)}
                        </span>
                        {!notification.is_read ? <span className="notifications-bell__item-dot" /> : null}
                      </span>
                    </button>
                  );
                })
              : null}
          </div>

          <div className="notifications-bell__footer">
            <button className="notifications-bell__footer-button" type="button" onClick={() => setIsOpen(false)}>
              Все уведомления
              <ChevronIcon />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
