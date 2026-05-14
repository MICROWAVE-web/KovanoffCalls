/** Public asset URL (Vite serves `frontend/public` at site root). */
export const RINGTONE_URL = "/audio/mixkit-on-hold-ringtone-1361.wav";

export function createLoopingRingtone(url: string = RINGTONE_URL): {
  play: () => void;
  stop: () => void;
} {
  const audio = new Audio(url);
  audio.loop = true;
  audio.preload = "auto";

  return {
    play() {
      void audio.play().catch(() => {
        /* autoplay policy — caller path usually has prior gesture */
      });
    },
    stop() {
      audio.pause();
      audio.currentTime = 0;
    },
  };
}
