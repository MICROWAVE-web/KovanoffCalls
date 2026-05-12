import { useEffect } from "react";
import { useAppStore } from "./store";
import { bootstrapAuth } from "./auth";
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
    return (
      <div className="min-h-full flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <h2 className="text-lg font-semibold text-red-600">Authentication failed</h2>
          <p className="mt-2 text-sm text-slate-600">{authError}</p>
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
