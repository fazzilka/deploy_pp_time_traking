import { API_URL, getAccessToken, handleUnauthorizedSession, USE_MOCKS } from "../api/client";

export const WORKSPACE_MEMBERSHIP_CHANGED_EVENT = "time-tracking:workspace-membership-changed";
export const NOTIFICATIONS_CHANGED_EVENT = "time-tracking:notifications-changed";

export type WorkspaceMembershipChangedPayload = {
  type: "workspace.membership.changed";
  reason: "added" | "removed" | "role_changed";
  workspace_id: number;
  workspace_name?: string;
  user_id?: number;
  created_at?: string;
};

export type NotificationsChangedPayload = {
  type: "notifications.changed";
  notification_id?: number;
  workspace_id?: number;
  created_at?: string;
};

export type UserEventPayload = WorkspaceMembershipChangedPayload | NotificationsChangedPayload | Record<string, unknown>;

type SubscribeOptions = {
  onEvent: (event: string, payload: UserEventPayload) => void;
};

type ParsedSseEvent = {
  event: string;
  data: string;
};

function parseSseEvent(rawEvent: string): ParsedSseEvent | null {
  const lines = rawEvent.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
}

function dispatchWorkspaceEvent(payload: WorkspaceMembershipChangedPayload) {
  window.dispatchEvent(new CustomEvent(WORKSPACE_MEMBERSHIP_CHANGED_EVENT, { detail: payload }));
}

function dispatchNotificationsEvent(payload: NotificationsChangedPayload) {
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail: payload }));
}

export function subscribeToUserEvents({ onEvent }: SubscribeOptions): () => void {
  if (USE_MOCKS) {
    return () => undefined;
  }

  let isClosed = false;
  let reconnectDelayMs = 1000;
  let reconnectTimer: number | null = null;
  let controller: AbortController | null = null;

  async function connect() {
    const token = getAccessToken();
    if (!token || isClosed) {
      return;
    }

    controller = new AbortController();

    try {
      const response = await fetch(`${API_URL}/api/v1/events/stream`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      });

      if (response.status === 401) {
        handleUnauthorizedSession();
      }

      if (!response.ok || !response.body) {
        throw new Error(`Events stream failed: ${response.status}`);
      }

      reconnectDelayMs = 1000;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!isClosed) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? "";

        for (const rawPart of parts) {
          const parsed = parseSseEvent(rawPart);
          if (!parsed || parsed.event === "ping") {
            continue;
          }

          try {
            const payload = JSON.parse(parsed.data) as UserEventPayload;
            onEvent(parsed.event, payload);
            if (parsed.event === "workspace.membership.changed") {
              dispatchWorkspaceEvent(payload as WorkspaceMembershipChangedPayload);
            } else if (parsed.event === "notifications.changed") {
              dispatchNotificationsEvent(payload as NotificationsChangedPayload);
            }
          } catch {
            // Ignore malformed event payloads; the stream can keep running.
          }
        }
      }
    } catch (error) {
      if (isClosed || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }
    } finally {
      controller = null;
    }

    if (!isClosed) {
      reconnectTimer = window.setTimeout(() => {
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000);
        void connect();
      }, reconnectDelayMs);
    }
  }

  void connect();

  return () => {
    isClosed = true;
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
    }
    controller?.abort();
  };
}
