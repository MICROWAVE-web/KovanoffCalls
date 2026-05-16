import { placeCall } from "../callFlow";
import type { CallMediaMode, OnlineUser } from "../types";
import { PressableButton } from "./PressableButton";

export function CallActionButtons({ user }: { user: OnlineUser }) {
  return (
    <div className="flex gap-2 shrink-0">
      <PressableButton
        type="button"
        aria-label={`Аудиозвонок ${user.name}`}
        onClick={() => void placeCall(user.id, "audio")}
        className="h-10 w-10 rounded-full bg-slate-700 dark:bg-slate-600 text-white flex items-center justify-center shadow-sm active:bg-slate-800"
      >
        <PhoneIcon />
      </PressableButton>
      <PressableButton
        type="button"
        aria-label={`Видеозвонок ${user.name}`}
        onClick={() => void placeCall(user.id, "video")}
        className="h-10 w-10 rounded-full bg-brand text-white flex items-center justify-center shadow-sm active:bg-brand-dark"
      >
        <CameraIcon />
      </PressableButton>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.85 21 3 13.15 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2Z" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4Z" />
    </svg>
  );
}
