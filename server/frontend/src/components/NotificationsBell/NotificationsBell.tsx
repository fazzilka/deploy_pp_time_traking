import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import { useLocale } from "../../i18n";
import type { TranslationKey } from "../../i18n/locales/ru";
import type { TranslationParams } from "../../i18n/types";
import { formatDeadline } from "../../shared/utils/date";
import { acceptInvitation, declineInvitation } from "../../shared/api/invitations";
import { NOTIFICATIONS_CHANGED_EVENT } from "../../shared/events/userEvents";
import { invitationErrorKey } from "../../shared/utils/securityErrors";
import { LanguageSwitcher } from "../LanguageSwitcher/LanguageSwitcher";
import "./NotificationsBell.css";

type NotificationType =
  | "deadline_soon"
  | "deadline_overdue"
  | "workspace_member_added"
  | "workspace_member_removed"
  | "workspace_role_changed"
  | "workspace_member_role_changed"
  | "workspace_invitation"
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

  if (type === "workspace_invitation") {
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

  if (type === "workspace_member_added" || type === "workspace_invitation") {
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

type Translate = (key: TranslationKey, params?: TranslationParams) => string;

function getPayloadString(payload: NotificationPayload | undefined, key: string): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function getPayloadNumber(payload: NotificationPayload | undefined, key: string): number | null {
  const value = payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatNotificationDuration(totalMinutes: number, locale: "ru" | "en"): string {
  const safeMinutes = Math.max(1, Math.round(totalMinutes));
  const unit = safeMinutes >= 60 ? "hour" : "minute";
  const value = unit === "hour" ? Math.max(1, Math.round(safeMinutes / 60)) : safeMinutes;
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    style: "unit",
    unit,
    unitDisplay: "long",
  }).format(value);
}

function getLocalizedRole(payload: NotificationPayload | undefined, t: Translate): string {
  const role = getPayloadString(payload, "role");
  const key = role && `roles.${role}` as TranslationKey;
  return key && ["roles.owner", "roles.team_lead", "roles.member", "roles.viewer", "roles.user"].includes(key)
    ? t(key)
    : t("roles.user");
}

function getNotificationCopy(
  notification: NotificationItem,
  locale: "ru" | "en",
  t: Translate,
): { title: string; message: string } {
  const taskTitle = getPayloadString(notification.payload, "task_title") ?? t("notifications.fallback.task");
  const workspaceName = getPayloadString(notification.payload, "workspace_name") ?? t("notifications.fallback.workspace");
  const deadline = getPayloadString(notification.payload, "deadline");
  const formattedDeadline = deadline ? formatDeadline(deadline, locale) : null;

  if (notification.type === "deadline_soon") {
    const remindBeforeMinutes = getPayloadNumber(notification.payload, "remind_before_minutes") ?? 60;
    const remaining = formatNotificationDuration(remindBeforeMinutes, locale);
    return {
      title: remindBeforeMinutes === 60
        ? t("notifications.types.deadlineSoon.title")
        : t("notifications.types.deadlineSoon.titleGeneric"),
      message: formattedDeadline
        ? t("notifications.types.deadlineSoon.body", { taskTitle, remaining, deadline: formattedDeadline })
        : t("notifications.types.deadlineSoon.bodyNoDeadline", { taskTitle, remaining }),
    };
  }

  if (notification.type === "deadline_overdue") {
    return {
      title: t("notifications.types.deadlineOverdue.title"),
      message: formattedDeadline
        ? t("notifications.types.deadlineOverdue.body", { taskTitle, deadline: formattedDeadline })
        : t("notifications.types.deadlineOverdue.bodyNoDeadline", { taskTitle }),
    };
  }

  if (notification.type === "workspace_member_added") {
    return {
      title: t("notifications.types.workspaceAdded.title"),
      message: t("notifications.types.workspaceAdded.body", { workspaceName }),
    };
  }

  if (notification.type === "workspace_invitation") {
    const inviterName = getPayloadString(notification.payload, "invited_by_display_name") ?? t("notifications.fallback.user");
    return {
      title: t("invitations.title"),
      message: t("invitations.description", { inviterName, workspaceName }),
    };
  }

  if (notification.type === "workspace_member_removed") {
    return {
      title: t("notifications.types.workspaceRemoved.title"),
      message: t("notifications.types.workspaceRemoved.body", { workspaceName }),
    };
  }

  if (notification.type === "workspace_role_changed" || notification.type === "workspace_member_role_changed") {
    return {
      title: t("notifications.types.roleChanged.title"),
      message: t("notifications.types.roleChanged.body", {
        workspaceName,
        role: getLocalizedRole(notification.payload, t),
      }),
    };
  }

  return {
    title: t("notifications.fallback.title"),
    message: t("notifications.fallback.body"),
  };
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

function formatNotificationDate(value: string, locale: "ru" | "en"): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - targetDay.getTime()) / 86_400_000);

  const intlLocale = locale === "ru" ? "ru-RU" : "en-US";
  const time = new Intl.DateTimeFormat(intlLocale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (diffDays === 0) {
    return locale === "ru" ? `Сегодня, ${time}` : `Today, ${time}`;
  }

  if (diffDays === 1) {
    return locale === "ru" ? `Вчера, ${time}` : `Yesterday, ${time}`;
  }

  return new Intl.DateTimeFormat(intlLocale, {
    day: "numeric",
    month: locale === "ru" ? "long" : "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function NotificationsBell() {
  const { locale, t } = useLocale();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [invitationAction, setInvitationAction] = useState<{ id: number; action: "accept" | "decline" } | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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
    setHasError(false);

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
    } catch {
      setHasError(true);
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
    const reload = () => {
      void loadUnreadCount();
      if (isOpen) void loadNotifications();
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, reload);
  }, [isOpen, loadNotifications, loadUnreadCount]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current) {
        return;
      }

      const target = event.target as HTMLElement;
      if (!rootRef.current.contains(target) && !target.closest(".language-switcher")) {
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

  async function handleInvitationAction(
    event: ReactMouseEvent<HTMLButtonElement>,
    notification: NotificationItem,
    action: "accept" | "decline",
  ) {
    event.stopPropagation();
    const invitationId = getPayloadString(notification.payload, "invitation_id");
    if (!invitationId || invitationAction) return;
    setInvitationAction({ id: notification.id, action });
    setActionMessage(null);
    try {
      if (action === "accept") await acceptInvitation(invitationId);
      else await declineInvitation(invitationId);
      setItems((current) => current.map((item) => item.id === notification.id ? {
        ...item,
        is_read: true,
        read_at: new Date().toISOString(),
        payload: { ...(item.payload ?? {}), status: action === "accept" ? "accepted" : "declined" },
      } : item));
      setActionMessage(t(action === "accept" ? "invitations.accepted" : "invitations.declined"));
      void loadUnreadCount();
    } catch (caughtError) {
      setActionMessage(t(invitationErrorKey(caughtError)));
    } finally {
      setInvitationAction(null);
    }
  }

  return (
    <div className="notifications-bell" ref={rootRef}>
      <button
        className={isOpen ? "notifications-bell__button notifications-bell__button--active" : "notifications-bell__button"}
        type="button"
        aria-label={t("notifications.openAria")}
        aria-expanded={isOpen}
        onClick={handleToggle}
      >
        <BellIcon />
        {badgeLabel ? <span className="notifications-bell__badge">{badgeLabel}</span> : null}
      </button>

      {isOpen ? (
        <div className="notifications-bell__dropdown" role="dialog" aria-label={t("notifications.title")}>
          <div className="notifications-bell__header">
            <h2 className="notifications-bell__title">{t("notifications.title")}</h2>

            <LanguageSwitcher className="notifications-bell__language" />

            <button
              className="notifications-bell__mark-all"
              type="button"
              disabled={unreadCount <= 0 || isMarkingAll}
              onClick={handleMarkAllAsRead}
              aria-label={t("notifications.actions.markAllAria")}
            >
              {t("notifications.actions.markAllAsRead")}
            </button>
          </div>

          <div className="notifications-bell__list">
            {actionMessage ? <div className="notifications-bell__action-message" role="status">{actionMessage}</div> : null}
            {isLoading ? <div className="notifications-bell__state" role="status">{t("notifications.loading")}</div> : null}

            {!isLoading && hasError ? (
              <div className="notifications-bell__state notifications-bell__error" role="alert">{t("notifications.error")}</div>
            ) : null}

            {!isLoading && !hasError && items.length === 0 ? (
              <div className="notifications-bell__state notifications-bell__state--empty">
                <strong>{t("notifications.empty.title")}</strong>
                <span>{t("notifications.empty.description")}</span>
              </div>
            ) : null}

            {!isLoading && !hasError
              ? items.map((notification) => {
                  const tone = getNotificationTone(notification.type);
                  const copy = getNotificationCopy(notification, locale, t);

                  return (
                    <div
                      key={notification.id}
                      className={
                        notification.is_read
                          ? `notifications-bell__item notifications-bell__item--${tone}`
                          : `notifications-bell__item notifications-bell__item--${tone} notifications-bell__item--unread`
                      }
                      onClick={() => void handleMarkAsRead(notification)}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") void handleMarkAsRead(notification); }}
                      role="button"
                      tabIndex={0}
                      aria-label={!notification.is_read ? t("notifications.unreadAria", { title: copy.title }) : undefined}
                    >
                      <span className={`notifications-bell__item-icon notifications-bell__item-icon--${tone}`}>
                        {getNotificationIcon(notification.type)}
                      </span>

                      <span className="notifications-bell__item-content">
                        <span className="notifications-bell__item-title">{copy.title}</span>
                        <span className="notifications-bell__item-message">{copy.message}</span>
                        {notification.type === "workspace_invitation" && getPayloadString(notification.payload, "status") === "pending" ? (
                          <span className="notifications-bell__invitation-actions">
                            <button type="button" disabled={Boolean(invitationAction)} onClick={(event) => void handleInvitationAction(event, notification, "accept")}>{t(invitationAction?.id === notification.id && invitationAction.action === "accept" ? "invitations.accepting" : "invitations.accept")}</button>
                            <button type="button" disabled={Boolean(invitationAction)} onClick={(event) => void handleInvitationAction(event, notification, "decline")}>{t(invitationAction?.id === notification.id && invitationAction.action === "decline" ? "invitations.declining" : "invitations.decline")}</button>
                          </span>
                        ) : null}
                      </span>

                      <span className="notifications-bell__item-meta">
                        <span className="notifications-bell__item-date">
                          {formatNotificationDate(notification.created_at, locale)}
                        </span>
                        {!notification.is_read ? <span className="notifications-bell__item-dot" /> : null}
                      </span>
                    </div>
                  );
                })
              : null}
          </div>

          <div className="notifications-bell__footer">
            <button className="notifications-bell__footer-button" type="button" onClick={() => setIsOpen(false)} aria-label={t("notifications.actions.viewAllAria")}>
              {t("notifications.actions.viewAll")}
              <ChevronIcon />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
