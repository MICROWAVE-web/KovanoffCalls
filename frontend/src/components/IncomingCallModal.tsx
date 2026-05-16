import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { acceptIncomingCall, declineIncomingCall } from "../callFlow";
import { createLoopingRingtone } from "../ringtone";
import { useAppStore } from "../store";
import { PressableButton } from "./PressableButton";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function IncomingCallModal() {
  const incoming = useAppStore((s) => s.incomingCall);
  const reduceMotion = useReducedMotion();
  const isSm = useMediaQuery("(min-width: 640px)");

  useEffect(() => {
    if (!incoming) return undefined;
    const ring = createLoopingRingtone();
    ring.play();
    return () => ring.stop();
  }, [incoming?.callId]);

  const backdropTransition = reduceMotion
    ? { duration: 0.12 }
    : { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const };

  const panelTransition = reduceMotion
    ? { duration: 0.12 }
    : isSm
      ? { type: "spring" as const, damping: 28, stiffness: 380, mass: 0.85 }
      : { type: "spring" as const, damping: 32, stiffness: 420, mass: 0.9 };

  const panelInitial = reduceMotion
    ? { opacity: 0 }
    : isSm
      ? { opacity: 0, y: 28, scale: 0.92 }
      : { opacity: 0, y: "100%" };

  const panelAnimate = reduceMotion
    ? { opacity: 1 }
    : isSm
      ? { opacity: 1, y: 0, scale: 1 }
      : { opacity: 1, y: 0 };

  const panelExit = reduceMotion
    ? { opacity: 0 }
    : isSm
      ? { opacity: 0, y: 20, scale: 0.94 }
      : { opacity: 0, y: "100%" };

  const stagger = reduceMotion ? 0 : 0.055;

  const buttonParent = {
    hidden: {},
    show: {
      transition: { staggerChildren: stagger, delayChildren: reduceMotion ? 0 : 0.08 },
    },
  };

  const buttonChild = {
    hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 },
    show: {
      opacity: 1,
      y: 0,
      transition: reduceMotion ? { duration: 0.12 } : { type: "spring", damping: 24, stiffness: 400 },
    },
  };

  return (
    <AnimatePresence>
      {incoming ? (
        <motion.div
          key={incoming.callId}
          role="presentation"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 dark:bg-black/55 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={backdropTransition}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="incoming-call-title"
            className="w-full sm:max-w-sm bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-xl dark:shadow-slate-950/50 border border-transparent dark:border-slate-800 p-6 flex flex-col items-center gap-4"
            initial={panelInitial}
            animate={panelAnimate}
            exit={panelExit}
            transition={panelTransition}
            onClick={(e) => e.stopPropagation()}
          >
            {incoming.caller.photo_url ? (
              <img
                src={incoming.caller.photo_url}
                alt={incoming.caller.name}
                className="h-20 w-20 rounded-full object-cover ring-2 ring-slate-100 dark:ring-slate-700"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-brand/15 dark:bg-brand/25 text-brand flex items-center justify-center text-2xl font-semibold">
                {incoming.caller.name
                  .split(" ")
                  .map((part) => part.charAt(0).toUpperCase())
                  .slice(0, 2)
                  .join("") || "?"}
              </div>
            )}
            <div className="text-center">
              <div id="incoming-call-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {incoming.caller.name}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{incoming.mediaMode === "audio"
                  ? "Входящий аудиозвонок…"
                  : "Входящий видеозвонок…"}</div>
            </div>

            <motion.div
              className="flex gap-3 w-full pt-2"
              variants={buttonParent}
              initial="hidden"
              animate="show"
            >
              <motion.div className="flex-1" variants={buttonChild}>
                <PressableButton
                  type="button"
                  onClick={() => declineIncomingCall()}
                  className="w-full rounded-full bg-red-500 text-white font-semibold py-3 shadow-sm active:bg-red-600 hover:bg-red-600/95"
                >
                  Отклонить
                </PressableButton>
              </motion.div>
              <motion.div className="flex-1" variants={buttonChild}>
                <PressableButton
                  type="button"
                  onClick={() => void acceptIncomingCall()}
                  className="w-full rounded-full bg-emerald-500 text-white font-semibold py-3 shadow-sm active:bg-emerald-600 hover:bg-emerald-600/95"
                >
                  Ответить
                </PressableButton>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
