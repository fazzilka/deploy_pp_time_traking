import { apiRequest, USE_MOCKS } from "./client";
import { mockUser } from "./mockData";
import type { AuthResponse, LoginRequest, RegisterRequest } from "../types/auth";

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
}

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  if (USE_MOCKS) {
    if (!payload.email.trim() || payload.password.length < 4) {
      throw new Error("Проверьте email и пароль");
    }

    return {
      access_token: createMockToken(payload.email),
      token_type: "bearer",
      user: mockUser,
    };
  }

  return apiRequest<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function register(payload: RegisterRequest): Promise<AuthResponse> {
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

    return {
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
  }

  return apiRequest<AuthResponse>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
