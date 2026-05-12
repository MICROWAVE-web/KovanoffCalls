import { api } from "./api";
import { getInitData } from "./telegram";
import { useAppStore } from "./store";

const TOKEN_KEY = "kovanoff.jwt";

export function loadStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function persistToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // localStorage may be unavailable (e.g. private mode)
  }
}

export async function login(): Promise<void> {
  const initData = getInitData();
  if (!initData) {
    useAppStore.getState().setAuthError(
      "Open this app inside Telegram (no initData detected).",
    );
    return;
  }
  useAppStore.getState().setAuthLoading(true);
  try {
    const { access_token, user } = await api.authTelegram(initData);
    persistToken(access_token);
    useAppStore.getState().setAuth(access_token, user);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    useAppStore.getState().setAuthError(message);
  } finally {
    useAppStore.getState().setAuthLoading(false);
  }
}

export async function bootstrapAuth(): Promise<void> {
  const stored = loadStoredToken();
  if (stored) {
    try {
      const user = await api.me(stored);
      useAppStore.getState().setAuth(stored, user);
      return;
    } catch {
      persistToken(null);
    }
  }
  await login();
}
