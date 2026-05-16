import type { OnlineUser, PublicUser } from "../types";

export function UserAvatar({ user }: { user: PublicUser | OnlineUser }) {
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
    <div className="h-12 w-12 rounded-full bg-brand/15 dark:bg-brand/25 text-brand flex items-center justify-center font-semibold">
      {initials || "?"}
    </div>
  );
}

export function ExternalAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
  return (
    <div className="h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center font-semibold">
      {initials || "?"}
    </div>
  );
}
