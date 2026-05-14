import { useEffect } from "react";
import { useAppStore } from "./store";
import { bootstrapAuth, retryAuth } from "./auth";
import { initTelegram } from "./telegram";
import { signaling } from "./websocket";
import { installCallFlow } from "./callFlow";
import { UserList } from "./components/UserList";
import { IncomingCallModal } from "./components/IncomingCallModal";
import { CallScreen } from "./components/CallScreen";

export function App() {
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
      <div className="min-h-full flex items-center justify-center p-6 text-center">
        <div className="max-w-sm w-full">
          <h2 className="text-lg font-semibold text-red-600">Authentication failed</h2>
          <p className="mt-2 text-sm text-slate-600">{authError}</p>
          <button
            type="button"
            className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={authLoading}
            onClick={() => void retryAuth()}
          >
            Retry
          </button>
          <pre className="mt-4 text-left text-xs bg-slate-100 rounded p-3 overflow-auto whitespace-pre-wrap break-all">
            {JSON.stringify(debug, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  if (!user || authLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-slate-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <UserList />
      {activeCall ? <CallScreen /> : null}
      <IncomingCallModal />
    </div>
  );
}
