import type { User, UserPublic } from "./user";

export type LoginRequest = {
  email: string;
  password: string;
};

export type RegisterRequest = {
  email: string;
  username: string;
  full_name?: string;
  password: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: "bearer";
  user?: User;
};

export type RegistrationStartResponse = {
  verification_id: string;
  email_masked: string;
  expires_in_seconds: number;
  resend_available_in_seconds: number;
};

export type RegistrationResendResponse = {
  expires_in_seconds: number;
  resend_available_in_seconds: number;
};

export type RegisterResponse = UserPublic;
