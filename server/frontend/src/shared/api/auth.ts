import { apiRequest, USE_MOCKS } from "./client";
import { clearUserCaches, hydrateUserCachesFromAuth } from "./profile";
import { clearReportsCache } from "./reports";
import { clearProtectedVaultToken } from "./protectedSpace";
import { mockUser } from "./mockData";
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  RegistrationResendResponse,
  RegistrationStartResponse,
} from "../types/auth";

const tokenKey = "access_token";
export const authChangedEvent = "time-tracking:auth-changed";

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
  window.dispatchEvent(new Event(authChangedEvent));
}

export function logout(): void {
  localStorage.removeItem(tokenKey);
  clearProtectedVaultToken();
  clearUserCaches();
  clearReportsCache();
  window.dispatchEvent(new Event(authChangedEvent));
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
    clearReportsCache();
    return response;
  }

  const response = await apiRequest<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (response.user) {
    hydrateUserCachesFromAuth(response.user);
  }
  clearReportsCache();
  return response;
}

let mockVerificationCode = "012345";

export async function startRegistration(payload: RegisterRequest): Promise<RegistrationStartResponse> {
  if (USE_MOCKS) {
    if (!payload.email.includes("@")) {
      throw new Error("Введите корректный email");
    }

    if (payload.username.trim().length < 3) {
      throw new Error("Username должен быть не короче 3 символов");
    }

    if (payload.password.length < 12) {
      throw new Error("Пароль должен быть не короче 12 символов");
    }

    mockVerificationCode = "012345";
    return {
      verification_id: "00000000-0000-4000-8000-000000000001",
      email_masked: `${payload.email.slice(0, 1)}***@${payload.email.split("@")[1]}`,
      expires_in_seconds: 600,
      resend_available_in_seconds: 60,
    };
  }

  return apiRequest<RegistrationStartResponse>("/api/v1/auth/register/start", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function verifyRegistration(verificationId: string, code: string): Promise<AuthResponse> {
  if (USE_MOCKS) {
    if (code !== mockVerificationCode) {
      throw new Error("Неверный или недействительный код");
    }
    const response: AuthResponse = {
      access_token: createMockToken(verificationId),
      token_type: "bearer",
      user: mockUser,
    };
    if (response.user) {
      hydrateUserCachesFromAuth(response.user);
    }
    clearReportsCache();
    return response;
  }
  const response = await apiRequest<AuthResponse>("/api/v1/auth/register/verify", {
    method: "POST",
    body: JSON.stringify({ verification_id: verificationId, code }),
  });
  if (response.user) {
    hydrateUserCachesFromAuth(response.user);
  }
  clearReportsCache();
  return response;
}

export async function resendRegistrationCode(
  verificationId: string,
): Promise<RegistrationResendResponse> {
  if (USE_MOCKS) {
    mockVerificationCode = "012345";
    return { expires_in_seconds: 600, resend_available_in_seconds: 60 };
  }
  return apiRequest<RegistrationResendResponse>("/api/v1/auth/register/resend", {
    method: "POST",
    body: JSON.stringify({ verification_id: verificationId }),
  });
}

export const register = startRegistration;
