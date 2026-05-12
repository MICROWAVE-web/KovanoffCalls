import type { OnlineUser, PublicUser } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;
  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data: unknown = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const detail =
      (data && typeof data === "object" && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : undefined) ?? response.statusText;
    throw new ApiError(response.status, detail, data);
  }
  return data as T;
}

export interface TelegramAuthResponse {
  access_token: string;
  user: PublicUser;
}

export const api = {
  authTelegram: (initData: string) =>
    request<TelegramAuthResponse>("/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData }),
    }),
  me: (token: string) => request<PublicUser>("/users/me", { method: "GET" }, token),
  onlineUsers: (token: string) =>
    request<OnlineUser[]>("/users/online", { method: "GET" }, token),
};
