import { useState } from "react";
import { FriendsTab } from "./FriendsTab";
import { SearchTab } from "./SearchTab";

type TabId = "friends" | "search";

export function HomeScreen() {
  const [tab, setTab] = useState<TabId>("friends");

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 flex flex-col">
      <div className="flex-1 overflow-y-auto">
        {tab === "friends" ? <FriendsTab /> : <SearchTab />}
      </div>

      <nav
        className="fixed bottom-0 inset-x-0 z-20 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
        aria-label="Навигация"
      >
        <div className="flex max-w-lg mx-auto">
          <TabButton
            active={tab === "friends"}
            onClick={() => setTab("friends")}
            label="Друзья"
          />
          <TabButton active={tab === "search"} onClick={() => setTab("search")} label="Поиск" />
        </div>
      </nav>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-3 text-sm font-semibold transition-colors ${
        active
          ? "text-brand border-t-2 border-brand -mt-px"
          : "text-slate-500 dark:text-slate-400 border-t-2 border-transparent"
      }`}
    >
      {label}
    </button>
  );
}
