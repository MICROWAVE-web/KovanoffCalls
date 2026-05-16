import { useEffect, useMemo } from "react";
import { api } from "../api";
import { refreshFriendsDirectory } from "../callFlow";
import { useAppStore } from "../store";
import type { ExternalPeer, OnlineUser } from "../types";
import { openTelegramLink } from "../telegram";
import { CallActionButtons } from "./CallActionButtons";
import { PressableButton } from "./PressableButton";
import { ExternalAvatar, UserAvatar } from "./UserAvatar";

function resolveBotUsername(fromApi: string | null | undefined): string {
  const env = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;
  const raw = (fromApi ?? "").trim() || (env ?? "").trim();
  return raw.replace(/^@/, "");
}

function FriendRow({ user, online }: { user: OnlineUser; online: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white dark:bg-slate-900 shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800 p-3">
      <UserAvatar user={user} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{user.name}</div>
        <div
          className={`text-xs mt-0.5 ${online ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}
        >
          {online ? "в сети" : "не в сети"}
        </div>
      </div>
      <CallActionButtons user={user} />
    </div>
  );
}

export function FriendsTab() {
  const jwt = useAppStore((s) => s.jwt);
  const friendsDirectory = useAppStore((s) => s.friendsDirectory);
  const onlineUsers = useAppStore((s) => s.onlineUsers);
  const wsConnected = useAppStore((s) => s.wsConnected);

  const botUsername = useMemo(
    () => resolveBotUsername(friendsDirectory.telegram_bot_username),
    [friendsDirectory.telegram_bot_username],
  );

  useEffect(() => {
    void refreshFriendsDirectory();
    const handler = () => {
      if (document.visibilityState === "visible") void refreshFriendsDirectory();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const { offline, external, incoming_requests } = friendsDirectory;
  const online = onlineUsers;

  const openAddContacts = () => {
    if (!botUsername) {
      window.alert(
        "Имя бота не настроено (BOT_USERNAME / VITE_TELEGRAM_BOT_USERNAME). Попросите администратора задать его.",
      );
      return;
    }
    openTelegramLink(`https://t.me/${botUsername}?start=addcontacts`);
  };

  const inviteToRegister = (peer: ExternalPeer) => {
    if (!botUsername) {
      window.alert("Имя бота не настроено.");
      return;
    }
    const botUrl = `https://t.me/${botUsername}`;
    const text = encodeURIComponent(
      `${peer.name} — присоединяйся к Kovanoff Звонки: открой этого бота и нажми «Открыть звонки».`,
    );
    const url = encodeURIComponent(botUrl);
    openTelegramLink(`https://t.me/share/url?url=${url}&text=${text}`);
  };

  const onAccept = async (requestId: number) => {
    if (!jwt) return;
    try {
      await api.acceptFriendRequest(jwt, requestId);
      await refreshFriendsDirectory();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Не удалось принять заявку");
    }
  };

  const onDecline = async (requestId: number) => {
    if (!jwt) return;
    try {
      await api.declineFriendRequest(jwt, requestId);
      await refreshFriendsDirectory();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Не удалось отклонить заявку");
    }
  };

  const friendCount = online.length + offline.length;

  return (
    <div className="pb-24">
      <header className="px-5 pt-6 pb-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Друзья</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {wsConnected ? "Подключено" : "Подключение…"} · {friendCount} в списке
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <PressableButton
            type="button"
            onClick={() => void refreshFriendsDirectory()}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm"
          >
            Обновить
          </PressableButton>
          <PressableButton
            type="button"
            onClick={openAddContacts}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow-sm active:bg-brand-dark"
          >
            Добавить из Telegram
          </PressableButton>
        </div>
      </header>

      <div className="px-4 space-y-6">
        {incoming_requests.length > 0 ? (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              Заявки в друзья ({incoming_requests.length})
            </h2>
            <div className="space-y-2">
              {incoming_requests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center gap-3 rounded-lg bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 p-3"
                >
                  <UserAvatar user={req.from_user} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {req.from_user.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      хочет добавить вас в друзья
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <PressableButton
                      type="button"
                      onClick={() => void onDecline(req.id)}
                      className="rounded-full border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200"
                    >
                      Отклонить
                    </PressableButton>
                    <PressableButton
                      type="button"
                      onClick={() => void onAccept(req.id)}
                      className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-white"
                    >
                      Принять
                    </PressableButton>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
            Онлайн ({online.length})
          </h2>
          <div className="space-y-2">
            {online.length === 0 ? (
              <div className="rounded-lg bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 p-4 text-center text-slate-500 dark:text-slate-400 text-sm">
                Нет друзей в сети.
              </div>
            ) : (
              online.map((user) => <FriendRow key={user.id} user={user} online />)
            )}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
            Не в сети ({offline.length})
          </h2>
          <div className="space-y-2">
            {offline.length === 0 ? (
              <div className="rounded-lg bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 p-4 text-center text-slate-500 dark:text-slate-400 text-sm">
                Нет друзей вне сети.
              </div>
            ) : (
              offline.map((user) => <FriendRow key={user.id} user={user} online={false} />)
            )}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
            Нет в приложении ({external.length})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Люди из Telegram, которых вы добавили через бота. После регистрации отправьте заявку в
            друзья через вкладку «Поиск».
          </p>
          <div className="space-y-2">
            {external.length === 0 ? (
              <div className="rounded-lg bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 p-4 text-center text-slate-500 dark:text-slate-400 text-sm">
                Пока нет контактов. В чате с ботом нажмите «Добавить из Telegram».
              </div>
            ) : (
              external.map((peer) => (
                <div
                  key={peer.telegram_id}
                  className="flex items-center gap-3 rounded-lg bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 p-3"
                >
                  <ExternalAvatar name={peer.name} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {peer.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {peer.username ? `@${peer.username}` : `id ${peer.telegram_id}`}
                    </div>
                  </div>
                  <PressableButton
                    type="button"
                    onClick={() => inviteToRegister(peer)}
                    className="rounded-full border border-brand text-brand px-4 py-2 text-sm font-semibold bg-white dark:bg-slate-900"
                  >
                    Пригласить
                  </PressableButton>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
