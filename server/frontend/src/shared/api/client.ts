const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("access_token");

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401) {
    localStorage.removeItem("access_token");
    window.location.href = "/auth";
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error("Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
