import { useEffect, useState } from "react";
import { api } from "../api";
import { refreshFriendsDirectory } from "../callFlow";
import { useAppStore } from "../store";
import type { UserRelation, UserSearchResult } from "../types";
import { PressableButton } from "./PressableButton";
import { UserAvatar } from "./UserAvatar";

function RelationButton({
  user,
  jwt,
  onChanged,
}: {
  user: UserSearchResult;
  jwt: string;
  onChanged: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    try {
      await fn();
      onChanged();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  const relation = user.relation as UserRelation;

  if (relation === "friend") {
    return (
      <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">В друзьях</span>
    );
  }
  if (relation === "pending_out") {
    return (
      <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">Заявка отправлена</span>
    );
  }
  if (relation === "pending_in") {
    return (
      <PressableButton
        type="button"
        disabled={loading}
        onClick={() =>
          void run(async () => {
            const dir = await api.friendsDirectory(jwt);
            const req = dir.incoming_requests.find((r) => r.from_user.id === user.id);
            if (!req) {
              window.alert("Заявка не найдена. Обновите список.");
              return;
            }
            await api.acceptFriendRequest(jwt, req.id);
          })
        }
        className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shrink-0 disabled:opacity-50"
      >
        Принять
      </PressableButton>
    );
  }
  return (
    <PressableButton
      type="button"
      disabled={loading}
      onClick={() => void run(() => api.sendFriendRequest(jwt, user.id))}
      className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shrink-0 disabled:opacity-50"
    >
      Добавить
    </PressableButton>
  );
}

export function SearchTab() {
  const jwt = useAppStore((s) => s.jwt);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!jwt || query.trim().length < 1) {
      setResults([]);
      return undefined;
    }
    const handle = window.setTimeout(() => {
      setSearching(true);
      void api
        .searchUsers(jwt, query.trim())
        .then((res) => setResults(res.results))
        .catch((err) => {
          console.warn("search failed", err);
          setResults([]);
        })
        .finally(() => setSearching(false));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [jwt, query]);

  const onChanged = () => {
    void refreshFriendsDirectory();
    if (jwt && query.trim()) {
      void api.searchUsers(jwt, query.trim()).then((res) => setResults(res.results));
    }
  };

  return (
    <div className="pb-24">
      <header className="px-5 pt-6 pb-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Поиск</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Найдите пользователя и отправьте заявку в друзья
        </p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Имя или @username"
          className="mt-3 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/40"
          autoComplete="off"
        />
      </header>

      <div className="px-4">
        {query.trim().length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
            Введите имя или username для поиска
          </p>
        ) : searching ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Поиск…</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
            Никого не найдено
          </p>
        ) : (
          <div className="space-y-2">
            {results.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 rounded-lg bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 p-3"
              >
                <UserAvatar user={user} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {user.name}
                  </div>
                  {user.username ? (
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      @{user.username}
                    </div>
                  ) : null}
                </div>
                {jwt ? (
                  <RelationButton user={user} jwt={jwt} onChanged={onChanged} />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
