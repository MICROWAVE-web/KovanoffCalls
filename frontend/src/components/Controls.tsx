import type { ReactNode } from "react";
import { useAppStore } from "../store";
import { hangUp } from "../callFlow";
import { getActiveSession } from "../webrtc";

function IconButton({
  active,
  onClick,
  ariaLabel,
  children,
  variant = "neutral",
}: {
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
  variant?: "neutral" | "danger";
}) {
  const danger = variant === "danger";
  const base =
    "ui-pressable h-14 w-14 rounded-full flex items-center justify-center text-white shadow-lg";
  const color = danger
    ? "bg-red-500 active:bg-red-600"
    : active
      ? "bg-white/20 backdrop-blur"
      : "bg-white/40 backdrop-blur text-slate-900";
  return (
    <button type="button" aria-label={ariaLabel} onClick={onClick} className={`${base} ${color}`}>
      {children}
    </button>
  );
}

export function Controls() {
  const { micOn, camOn } = useAppStore((s) => s.mediaState);

  const onMic = () => {
    const session = getActiveSession();
    if (session) session.toggleMic();
  };
  const onCam = () => {
    const session = getActiveSession();
    if (session) session.toggleCam();
  };
  const onSwitch = () => {
    const session = getActiveSession();
    if (session) void session.switchCamera();
  };

  return (
    <div className="fixed bottom-6 inset-x-0 z-40 flex justify-center pointer-events-none">
      <div className="flex gap-4 pointer-events-auto">
        <IconButton active={micOn} onClick={onMic} ariaLabel={micOn ? "Выключить микрофон" : "Включить микрофон"}>
          {micOn ? <MicIcon /> : <MicOffIcon />}
        </IconButton>
        <IconButton active={camOn} onClick={onCam} ariaLabel={camOn ? "Выключить камеру" : "Включить камеру"}>
          {camOn ? <CamIcon /> : <CamOffIcon />}
        </IconButton>
        <IconButton active onClick={onSwitch} ariaLabel="Переключить камеру">
          <SwitchIcon />
        </IconButton>
        <IconButton active onClick={() => hangUp()} ariaLabel="Завершить звонок" variant="danger">
          <HangupIcon />
        </IconButton>
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
    </svg>
  );
}
function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      <path d="M19 11a7 7 0 0 1-1.06 3.7l-1.46-1.46A5 5 0 0 0 17 11h2ZM4.27 3 3 4.27l5.95 5.95V11a3 3 0 0 0 3 3c.34 0 .67-.06.97-.16l1.61 1.61A4.95 4.95 0 0 1 12 16a5 5 0 0 1-5-5H5a7 7 0 0 0 7 7c.95 0 1.85-.19 2.68-.53L19.73 21 21 19.73 4.27 3ZM15 6a3 3 0 0 0-6 0v1l6 6V6Z" />
    </svg>
  );
}
function CamIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4Z" />
    </svg>
  );
}
function CamOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      <path d="M21 6.5l-4 4V7a1 1 0 0 0-1-1H9.83l11 11.5L21 6.5ZM3.27 3 2 4.27 4.73 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12c.21 0 .41-.07.58-.18L19.73 21 21 19.73 3.27 3Z" />
    </svg>
  );
}
function SwitchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      <path d="M20 4h-3.17l-1.84-2H9l-1.83 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm-9 13-3.5-3.5h2.25A4.25 4.25 0 0 1 14 9.25V11l3-3-3-3v1.75A6.25 6.25 0 0 0 7.75 13H5.5L9 16.5l2-1.5Z" />
    </svg>
  );
}
function HangupIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a.996.996 0 0 1-1.41 0L.29 13.08a.996.996 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.39.38.39 1.02 0 1.41l-2.48 2.48a.996.996 0 0 1-1.41 0c-.79-.73-1.69-1.36-2.66-1.85-.34-.16-.56-.51-.56-.9v-3.1A14.96 14.96 0 0 0 12 9Z" />
    </svg>
  );
}
