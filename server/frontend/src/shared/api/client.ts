import { getVaultToken } from "./vaultToken";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

export function getAccessToken(): string | null {
  return localStorage.getItem("access_token");
}

export function handleUnauthorizedSession(): never {
  localStorage.removeItem("access_token");
  window.location.href = "/auth";
  throw new Error("Сессия истекла, войдите снова");
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(options.headers);
  const isAuthRequest = path.startsWith("/api/v1/auth/login") || path.startsWith("/api/v1/auth/register");

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Accept-Language")) {
    headers.set("Accept-Language", localStorage.getItem("time-tracking.locale") ?? navigator.language);
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const vaultToken = getVaultToken();
  if (vaultToken) {
    headers.set("X-Vault-Token", vaultToken);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && !isAuthRequest) {
    handleUnauthorizedSession();
  }

  if (!response.ok) {
    let message = `Ошибка запроса: ${response.status}`;

    try {
      const data = (await response.json()) as { detail?: unknown; error?: unknown; message?: unknown };
      const detail = data.detail ?? data.error ?? data.message;
      if (typeof detail === "string") {
        message = detail;
      } else if (detail) {
        message = JSON.stringify(detail);
      }
    } catch {
      // Response body is empty or not JSON.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
