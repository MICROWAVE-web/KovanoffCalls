import { useEffect } from "react";
import { useAppStore } from "../store";
import { placeCall, refreshOnlineUsers } from "../callFlow";
import type { OnlineUser } from "../types";

function Avatar({ user }: { user: OnlineUser }) {
  const initials = user.name
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
  if (user.photo_url) {
    return (
      <img
        src={user.photo_url}
        alt={user.name}
        className="h-12 w-12 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="h-12 w-12 rounded-full bg-brand/15 text-brand flex items-center justify-center font-semibold">
      {initials || "?"}
    </div>
  );
}

export function UserList() {
  const onlineUsers = useAppStore((s) => s.onlineUsers);
  const wsConnected = useAppStore((s) => s.wsConnected);
  const me = useAppStore((s) => s.user);

  useEffect(() => {
    void refreshOnlineUsers();
    const handler = () => {
      if (document.visibilityState === "visible") void refreshOnlineUsers();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const others = onlineUsers.filter((u) => u.id !== me?.id);

  return (
    <div className="min-h-full bg-slate-50">
      <header className="px-5 pt-6 pb-3">
        <h1 className="text-2xl font-semibold text-slate-900">Online</h1>
        <p className="text-sm text-slate-500 mt-1">
          {wsConnected ? "Connected" : "Connecting…"} · {others.length} available
        </p>
      </header>

      <div className="px-4 pb-24 space-y-2">
        {others.length === 0 ? (
          <div className="rounded-lg bg-white shadow-sm p-6 text-center text-slate-500">
            No one is online right now.
          </div>
        ) : (
          others.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 rounded-lg bg-white shadow-sm p-3"
            >
              <Avatar user={user} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 truncate">{user.name}</div>
                <div className="text-xs text-emerald-600 mt-0.5">online</div>
              </div>
              <button
                type="button"
                onClick={() => void placeCall(user.id)}
                className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm active:bg-brand-dark"
              >
                Call
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
