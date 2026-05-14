import { useEffect } from "react";
import { acceptIncomingCall, declineIncomingCall } from "../callFlow";
import { createLoopingRingtone } from "../ringtone";
import { useAppStore } from "../store";

export function IncomingCallModal() {
  const incoming = useAppStore((s) => s.incomingCall);

  useEffect(() => {
    if (!incoming) return undefined;
    const ring = createLoopingRingtone();
    ring.play();
    return () => ring.stop();
  }, [incoming?.callId]);

  if (!incoming) return null;

  const { caller } = incoming;
  const initials = caller.name
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-6 flex flex-col items-center gap-4">
        {caller.photo_url ? (
          <img
            src={caller.photo_url}
            alt={caller.name}
            className="h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <div className="h-20 w-20 rounded-full bg-brand/15 text-brand flex items-center justify-center text-2xl font-semibold">
            {initials || "?"}
          </div>
        )}
        <div className="text-center">
          <div className="text-lg font-semibold text-slate-900">{caller.name}</div>
          <div className="text-sm text-slate-500 mt-1">Incoming video call…</div>
        </div>

        <div className="flex gap-3 w-full pt-2">
          <button
            type="button"
            onClick={() => declineIncomingCall()}
            className="flex-1 rounded-full bg-red-500 text-white font-semibold py-3 active:bg-red-600"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => void acceptIncomingCall()}
            className="flex-1 rounded-full bg-emerald-500 text-white font-semibold py-3 active:bg-emerald-600"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
