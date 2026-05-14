import { useEffect } from "react";
import { getTelegramWebApp } from "./telegram";

const THEME_COLOR = { light: "#f8fafc", dark: "#020617" } as const;

function applyTheme(isDark: boolean): void {
  const root = document.documentElement;
  if (isDark) root.classList.add("dark");
  else root.classList.remove("dark");

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark ? THEME_COLOR.dark : THEME_COLOR.light);
}

function telegramIsDark(): boolean {
  return getTelegramWebApp()?.colorScheme === "dark";
}

/** Syncs `html.dark` from Telegram Mini App or system preference. */
export function useThemeRoot(): void {
  useEffect(() => {
    const tg = getTelegramWebApp();
    if (tg) {
      applyTheme(telegramIsDark());
      const onThemeChanged = () => applyTheme(telegramIsDark());
      if (typeof tg.onEvent === "function") {
        tg.onEvent("themeChanged", onThemeChanged);
        return () => {
          if (typeof tg.offEvent === "function") {
            tg.offEvent("themeChanged", onThemeChanged);
          }
        };
      }
      return undefined;
    }

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
}
