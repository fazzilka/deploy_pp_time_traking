import type { User } from "./user";

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

export type RegisterResponse = User;
