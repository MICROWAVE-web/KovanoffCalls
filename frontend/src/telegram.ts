interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramWebAppUser;
    auth_date?: number;
    hash?: string;
  };
  themeParams: TelegramThemeParams;
  colorScheme: "light" | "dark";
  isExpanded: boolean;
  ready: () => void;
  expand: () => void;
  close: () => void;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function initTelegram(): TelegramWebApp | null {
  const tg = getTelegramWebApp();
  if (!tg) return null;
  try {
    tg.ready();
    tg.expand();
  } catch {
    // ignore — older Telegram clients may lack some methods
  }
  return tg;
}

export function getInitData(): string {
  return getTelegramWebApp()?.initData ?? "";
}

export function getTelegramUser(): TelegramWebAppUser | null {
  return getTelegramWebApp()?.initDataUnsafe?.user ?? null;
}

/** Opens t.me / tg links inside Telegram when available. */
export function openTelegramLink(url: string): void {
  const tg = getTelegramWebApp();
  const fn = tg?.openTelegramLink;
  if (typeof fn === "function") {
    fn.call(tg, url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
