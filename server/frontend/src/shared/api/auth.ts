import { apiRequest, USE_MOCKS } from "./client";
import { clearUserCaches, hydrateUserCachesFromAuth } from "./profile";
import { invalidateReportsCache } from "./reports";
import { mockUser } from "./mockData";
import type { AuthResponse, LoginRequest, RegisterRequest, RegisterResponse } from "../types/auth";

const tokenKey = "access_token";

function createMockToken(email: string): string {
  return `mock-token-${btoa(email).replace(/=+$/g, "")}`;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(tokenKey);
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}

export function saveAccessToken(token: string): void {
  localStorage.setItem(tokenKey, token);
}

export function logout(): void {
  localStorage.removeItem(tokenKey);
  clearUserCaches();
  invalidateReportsCache();
}

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  if (USE_MOCKS) {
    if (!payload.email.trim() || payload.password.length < 4) {
      throw new Error("Проверьте email и пароль");
    }

    const response: AuthResponse = {
      access_token: createMockToken(payload.email),
      token_type: "bearer",
      user: mockUser,
    };
    if (response.user) {
      hydrateUserCachesFromAuth(response.user);
    }
    return response;
  }

  const response = await apiRequest<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (response.user) {
    hydrateUserCachesFromAuth(response.user);
  }
  return response;
}

export async function register(payload: RegisterRequest): Promise<AuthResponse | RegisterResponse> {
  if (USE_MOCKS) {
    if (!payload.email.includes("@")) {
      throw new Error("Введите корректный email");
    }

    if (payload.username.trim().length < 3) {
      throw new Error("Username должен быть не короче 3 символов");
    }

    if (payload.password.length < 6) {
      throw new Error("Пароль должен быть не короче 6 символов");
    }

    const response: AuthResponse = {
      access_token: createMockToken(payload.email),
      token_type: "bearer",
      user: {
        ...mockUser,
        email: payload.email,
        username: payload.username,
        full_name: payload.full_name?.trim() || null,
        avatar_letter: payload.username.slice(0, 1).toUpperCase(),
      },
    };
    if (response.user) {
      hydrateUserCachesFromAuth(response.user);
    }
    return response;
  }

  return apiRequest<RegisterResponse>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
