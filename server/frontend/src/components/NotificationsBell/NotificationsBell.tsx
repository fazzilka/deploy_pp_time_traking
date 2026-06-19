import { useCallback, useEffect, useRef, useState } from "react";
import {
  getNotifications,
  getUnreadNotificationsCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "../../shared/api/notifications";
import { NOTIFICATIONS_CHANGED_EVENT } from "../../shared/events/userEvents";
import "./NotificationsBell.css";

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
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function NotificationsBell() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshUnreadCount = useCallback(async (isMounted: () => boolean) => {
    try {
      const response = await getUnreadNotificationsCount();
      if (isMounted()) {
        setUnreadCount(response.unread_count);
      }
    } catch {
      if (isMounted()) {
        setUnreadCount(0);
      }
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);

    try {
      const response = await getNotifications({ limit: 20, offset: 0 });
      if (requestIdRef.current !== requestId) {
        return;
      }
      setItems(response.items);
      setUnreadCount(response.unread_count);
    } catch (loadError) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить уведомления");
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const isMounted = () => mounted;
    void refreshUnreadCount(isMounted);
    const intervalId = window.setInterval(() => {
      void refreshUnreadCount(isMounted);
    }, 60_000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      requestIdRef.current += 1;
    };
  }, [refreshUnreadCount]);

  useEffect(() => {
    if (isOpen) {
      void loadNotifications();
    }
  }, [isOpen, loadNotifications]);

  useEffect(() => {
    let mounted = true;
    const isMounted = () => mounted;

    function handleNotificationsChanged() {
      void refreshUnreadCount(isMounted);
      if (isOpen) {
        void loadNotifications();
      }
    }

    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged);
    return () => {
      mounted = false;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged);
    };
  }, [isOpen, loadNotifications, refreshUnreadCount]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
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

  async function handleNotificationClick(notification: NotificationItem) {
    if (isUpdating) {
      return;
    }
    setIsUpdating(true);
    setError(null);
    try {
      const updated = await markNotificationRead(notification.id);
      setItems((currentItems) =>
        currentItems.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (!notification.is_read) {
        setUnreadCount((count) => Math.max(0, count - 1));
      }
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Не удалось обновить уведомление");
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleMarkAllRead() {
    if (isUpdating || unreadCount === 0) {
      return;
    }
    setIsUpdating(true);
    setError(null);
    try {
      await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setItems((currentItems) =>
        currentItems.map((item) => ({
          ...item,
          is_read: true,
          read_at: item.read_at ?? readAt,
        })),
      );
      setUnreadCount(0);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Не удалось обновить уведомления");
    } finally {
      setIsUpdating(false);
    }
  }

  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div className="notifications-bell" ref={rootRef}>
      <button
        className={`notifications-bell__button${isOpen ? " notifications-bell__button--open" : ""}`}
        type="button"
        aria-label="Уведомления"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((value) => !value)}
      >
        <BellIcon />
        {unreadCount > 0 && <span className="notifications-bell__badge">{badgeLabel}</span>}
      </button>

      {isOpen && (
        <div className="notifications-bell__dropdown" role="dialog" aria-label="Уведомления">
          <div className="notifications-bell__header">
            <h2>Уведомления</h2>
            <button
              className="notifications-bell__mark-all"
              type="button"
              onClick={handleMarkAllRead}
              disabled={isUpdating || unreadCount === 0}
            >
              Отметить всё прочитанным
            </button>
          </div>

          {error && <div className="notifications-bell__state notifications-bell__state--error">{error}</div>}

          {isLoading ? (
            <div className="notifications-bell__state">Загрузка...</div>
          ) : items.length === 0 && !error ? (
            <div className="notifications-bell__state">Уведомлений пока нет</div>
          ) : (
            <div className="notifications-bell__list">
              {items.map((notification) => (
                <button
                  className={`notifications-bell__item${
                    notification.is_read ? "" : " notifications-bell__item--unread"
                  }`}
                  type="button"
                  key={notification.id}
                  onClick={() => void handleNotificationClick(notification)}
                >
                  <span className="notifications-bell__item-copy">
                    <strong>{notification.title}</strong>
                    <span>{notification.message}</span>
                  </span>
                  <time dateTime={notification.created_at}>
                    {formatNotificationTime(notification.created_at)}
                  </time>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
