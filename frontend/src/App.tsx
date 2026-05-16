import { useEffect } from "react";
import { useAppStore } from "./store";
import { bootstrapAuth, retryAuth } from "./auth";
import { initTelegram } from "./telegram";
import { signaling } from "./websocket";
import { installCallFlow } from "./callFlow";
import { HomeScreen } from "./components/HomeScreen";
import { IncomingCallModal } from "./components/IncomingCallModal";
import { CallScreen } from "./components/CallScreen";
import { PressableButton } from "./components/PressableButton";
import { useThemeRoot } from "./theme";

export function App() {
  useThemeRoot();
  const jwt = useAppStore((s) => s.jwt);
  const user = useAppStore((s) => s.user);
  const authLoading = useAppStore((s) => s.authLoading);
  const authError = useAppStore((s) => s.authError);
  const activeCall = useAppStore((s) => s.activeCall);

  useEffect(() => {
    initTelegram();
    void bootstrapAuth();
    const dispose = installCallFlow();
    return () => dispose();
  }, []);

  useEffect(() => {
    if (jwt) {
      signaling.connect(jwt);
      return () => signaling.disconnect();
    }
    return undefined;
  }, [jwt]);

  if (authError) {
    const w = window as unknown as {
      Telegram?: {
        WebApp?: {
          initData?: string;
          version?: string;
          platform?: string;
          initDataUnsafe?: { user?: { id?: number }; auth_date?: number };
        };
      };
    };
    const unsafe = w.Telegram?.WebApp?.initDataUnsafe;
    const debug = {
      hasWindowTelegram: Boolean(w.Telegram),
      hasWebApp: Boolean(w.Telegram?.WebApp),
      initDataLen: (w.Telegram?.WebApp?.initData ?? "").length,
      initDataUnsafeHasUser: Boolean(unsafe?.user),
      initDataUnsafeUserId: unsafe?.user?.id ?? null,
      initDataUnsafeAuthDate: unsafe?.auth_date ?? null,
      version: w.Telegram?.WebApp?.version ?? null,
      platform: w.Telegram?.WebApp?.platform ?? null,
      href: window.location.href,
      hashLen: window.location.hash.length,
      hashHead: window.location.hash.slice(0, 80),
    };
    return (
      <div className="min-h-full flex items-center justify-center p-6 text-center bg-slate-50 dark:bg-slate-950">
        <div className="max-w-sm w-full">
          <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Ошибка входа</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{authError}</p>
          <PressableButton
            type="button"
            className="mt-4 w-full rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50"
            disabled={authLoading}
            onClick={() => void retryAuth()}
          >
            Повторить
          </PressableButton>
          <pre className="mt-4 text-left text-xs bg-slate-100 dark:bg-slate-900 dark:text-slate-300 rounded p-3 overflow-auto whitespace-pre-wrap break-all border border-slate-200 dark:border-slate-800">
            {JSON.stringify(debug, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  if (!user || authLoading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-slate-500 dark:text-slate-400">Загрузка…</div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <HomeScreen />
      {activeCall ? <CallScreen /> : null}
      <IncomingCallModal />
    </div>
  );
}
