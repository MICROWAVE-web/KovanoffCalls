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

export function CallScreen() {
  const activeCall = useAppStore((s) => s.activeCall);
  const localStream = useAppStore((s) => s.localStream);
  const remoteStream = useAppStore((s) => s.remoteStream);

  const localRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);

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
