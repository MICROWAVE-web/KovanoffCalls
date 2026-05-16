import { useEffect, useRef, useState } from "react";
import { createLoopingRingtone } from "../ringtone";
import { useAppStore } from "../store";
import { Controls } from "./Controls";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function useCallTimer(startedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  if (startedAt === null) return "";
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  return formatDuration(elapsed);
}

function CallAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const initials = name
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="h-32 w-32 rounded-full object-cover ring-4 ring-white/20"
      />
    );
  }
  return (
    <div className="h-32 w-32 rounded-full bg-brand/30 text-white flex items-center justify-center text-4xl font-semibold ring-4 ring-white/20">
      {initials || "?"}
    </div>
  );
}

export function CallScreen() {
  const activeCall = useAppStore((s) => s.activeCall);
  const localStream = useAppStore((s) => s.localStream);
  const remoteStream = useAppStore((s) => s.remoteStream);

  const localRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);

  const isVideo = activeCall?.mediaMode === "video";

  useEffect(() => {
    if (!activeCall || activeCall.role !== "caller" || activeCall.status !== "ringing") {
      return undefined;
    }
    const ring = createLoopingRingtone();
    ring.play();
    return () => ring.stop();
  }, [activeCall?.callId, activeCall?.role, activeCall?.status]);

  useEffect(() => {
    if (localRef.current && localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const timer = useCallTimer(activeCall?.startedAt ?? null);

  if (!activeCall) return null;

  const statusLabel =
    activeCall.status === "ringing"
      ? "Звонит…"
      : activeCall.status === "connecting"
        ? "Подключение…"
        : activeCall.status === "active"
          ? timer
          : "";

  if (!isVideo) {
    return (
      <div className="fixed inset-0 z-30 bg-gradient-to-b from-slate-800 to-slate-950 text-white flex flex-col items-center justify-center">
        <div className="absolute top-0 inset-x-0 pt-6 px-5 flex flex-col items-center pointer-events-none">
          <CallAvatar name={activeCall.peer.name} photoUrl={activeCall.peer.photo_url} />
          <div className="text-lg font-medium mt-4 drop-shadow">{activeCall.peer.name}</div>
          <div className="text-sm mt-1 text-white/80 drop-shadow">{statusLabel}</div>
        </div>
        <Controls />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 bg-black text-white">
      <video
        ref={remoteRef}
        autoPlay
        playsInline
        className="absolute inset-0 h-full w-full object-cover bg-black"
      />

      <div className="absolute top-0 inset-x-0 pt-6 px-5 flex flex-col items-center pointer-events-none">
        <div className="text-lg font-medium drop-shadow">{activeCall.peer.name}</div>
        <div className="text-sm mt-1 text-white/80 drop-shadow">{statusLabel}</div>
      </div>

      <video
        ref={localRef}
        autoPlay
        muted
        playsInline
        className="absolute top-4 right-4 h-40 w-28 sm:h-48 sm:w-32 rounded-2xl object-cover shadow-lg border border-white/20 bg-slate-800"
      />

      <Controls />
    </div>
  );
}
