import { api } from "./api";
import { getInitData, getTelegramWebApp } from "./telegram";
import { useAppStore } from "./store";

const TOKEN_KEY = "kovanoff.jwt";

/** Fast poll while Telegram usually injects initData quickly. */
const INIT_DATA_PHASE1_MS = 12_000;
const INIT_DATA_PHASE1_STEP_MS = 50;
/** Slower poll for clients (e.g. Telegram Desktop) that fill initData late. */
const INIT_DATA_PHASE2_MS = 15_000;
const INIT_DATA_PHASE2_STEP_MS = 200;

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

/** Telegram WebView can expose WebApp before initData is populated. */
async function waitForInitData(maxMs: number, stepMs: number): Promise<string> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const v = getInitData();
    if (v) return v;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return "";
}

export async function login(): Promise<void> {
  useAppStore.getState().setAuthLoading(true);
  try {
    let initData = getInitData();
    if (!initData) {
      initData = await waitForInitData(INIT_DATA_PHASE1_MS, INIT_DATA_PHASE1_STEP_MS);
    }
    if (!initData && getTelegramWebApp()) {
      initData = await waitForInitData(INIT_DATA_PHASE2_MS, INIT_DATA_PHASE2_STEP_MS);
    }
    if (!initData) {
      const hasStub = Boolean(getTelegramWebApp());
      useAppStore.getState().setAuthError(
        hasStub
          ? 'Open only via the bot "Open Calls" Web App button (not a plain URL or "Open in browser"). Telegram did not pass initData.'
          : "Open this app inside Telegram (no initData detected).",
      );
      return;
    }
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

/** Clear auth error and run bootstrap again (e.g. user taps Retry after initData was late). */
export async function retryAuth(): Promise<void> {
  useAppStore.getState().setAuthError(null);
  await bootstrapAuth();
}
