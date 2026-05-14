import { useEffect, useMemo } from "react";
import { useAppStore } from "../store";
import { placeCall, refreshDirectory } from "../callFlow";
import type { ExternalPeer, OnlineUser } from "../types";
import { openTelegramLink } from "../telegram";

function UserAvatar({ user }: { user: OnlineUser }) {
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

function ExternalAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
  return (
    <div className="h-12 w-12 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-semibold">
      {initials || "?"}
    </div>
  );
}

function resolveBotUsername(
  fromApi: string | null | undefined,
): string {
  const env = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;
  const raw = (fromApi ?? "").trim() || (env ?? "").trim();
  return raw.replace(/^@/, "");
}

export function UserList() {
  const directory = useAppStore((s) => s.directory);
  const onlineUsers = useAppStore((s) => s.onlineUsers);
  const wsConnected = useAppStore((s) => s.wsConnected);

  const botUsername = useMemo(
    () => resolveBotUsername(directory.telegram_bot_username),
    [directory.telegram_bot_username],
  );

  useEffect(() => {
    void refreshDirectory();
    const handler = () => {
      if (document.visibilityState === "visible") void refreshDirectory();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const { offline, external } = directory;
  const online = onlineUsers;

  const openAddContacts = () => {
    if (!botUsername) {
      window.alert(
        "Bot username is not configured (BOT_USERNAME / VITE_TELEGRAM_BOT_USERNAME). Ask the admin to set it.",
      );
      return;
    }
    openTelegramLink(`https://t.me/${botUsername}?start=addcontacts`);
  };

  const inviteToRegister = (peer: ExternalPeer) => {
    if (!botUsername) {
      window.alert("Bot username is not configured.");
      return;
    }
    const botUrl = `https://t.me/${botUsername}`;
    const text = encodeURIComponent(
      `${peer.name} — join me on Kovanoff Calls: open this bot and tap “Open Calls”.`,
    );
    const url = encodeURIComponent(botUrl);
    openTelegramLink(`https://t.me/share/url?url=${url}&text=${text}`);
  };

  const totalOthers = online.length + offline.length + external.length;

  return (
    <div className="min-h-full bg-slate-50">
      <header className="px-5 pt-6 pb-3">
        <h1 className="text-2xl font-semibold text-slate-900">People</h1>
        <p className="text-sm text-slate-500 mt-1">
          {wsConnected ? "Connected" : "Connecting…"} · {totalOthers} in directory
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={() => void refreshDirectory()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={openAddContacts}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow-sm active:bg-brand-dark"
          >
            Add from Telegram
          </button>
        </div>
      </header>

      <div className="px-4 pb-24 space-y-6">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Online ({online.length})
          </h2>
          <div className="space-y-2">
            {online.length === 0 ? (
              <div className="rounded-lg bg-white shadow-sm p-4 text-center text-slate-500 text-sm">
                No one else is online.
              </div>
            ) : (
              online.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 rounded-lg bg-white shadow-sm p-3"
                >
                  <UserAvatar user={user} />
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
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Registered, offline ({offline.length})
          </h2>
          <div className="space-y-2">
            {offline.length === 0 ? (
              <div className="rounded-lg bg-white shadow-sm p-4 text-center text-slate-500 text-sm">
                No registered users are offline.
              </div>
            ) : (
              offline.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 rounded-lg bg-white shadow-sm p-3"
                >
                  <UserAvatar user={user} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">{user.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">offline</div>
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
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Not in app ({external.length})
          </h2>
          <p className="text-xs text-slate-500 mb-2">
            People you shared via the bot. They are not registered in Calls yet.
          </p>
          <div className="space-y-2">
            {external.length === 0 ? (
              <div className="rounded-lg bg-white shadow-sm p-4 text-center text-slate-500 text-sm">
                No contacts yet. Use “Add from Telegram” in the bot chat.
              </div>
            ) : (
              external.map((peer) => (
                <div
                  key={peer.telegram_id}
                  className="flex items-center gap-3 rounded-lg bg-white shadow-sm p-3"
                >
                  <ExternalAvatar name={peer.name} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">{peer.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      {peer.username ? `@${peer.username}` : `id ${peer.telegram_id}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => inviteToRegister(peer)}
                    className="rounded-full border border-brand text-brand px-4 py-2 text-sm font-semibold bg-white shadow-sm"
                  >
                    Invite
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
