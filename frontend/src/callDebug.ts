/** Verbose call / WebRTC tracing (browser console + server logs from user reports). */

const PREFIX = "[KovanoffCalls]";

function ts(): string {
  return new Date().toISOString();
}

export function callDebug(tag: string, detail?: unknown): void {
  if (detail === undefined) {
    console.info(`${PREFIX} ${ts()} ${tag}`);
  } else {
    console.info(`${PREFIX} ${ts()} ${tag}`, detail);
  }
}

export function callDebugWarn(tag: string, detail?: unknown): void {
  if (detail === undefined) {
    console.warn(`${PREFIX} ${ts()} ${tag}`);
  } else {
    console.warn(`${PREFIX} ${ts()} ${tag}`, detail);
  }
}

export function summarizeIceCandidate(candidate: RTCIceCandidateInit | null | undefined): string {
  if (candidate == null) return "(null)";
  const c = candidate.candidate;
  if (c == null || c === "") return "(end-of-candidates)";
  const typM = / typ (\S+)/.exec(c);
  const typ = typM ? typM[1] : "?";
  const foundation = /^candidate:(\d+)/.exec(c);
  const tail = c.length > 160 ? `${c.slice(0, 160)}…` : c;
  return `typ=${typ} foundation=${foundation?.[1] ?? "?"} sdpMid=${String(candidate.sdpMid)} mline=${String(candidate.sdpMLineIndex)} ${tail}`;
}

export function summarizeSdp(sdp: RTCSessionDescriptionInit | string | undefined): {
  type?: string;
  lines: number;
  bytes: number;
  mLines: string[];
} {
  if (sdp == null) return { lines: 0, bytes: 0, mLines: [] };
  const text = typeof sdp === "string" ? sdp : sdp.sdp ?? "";
  const type = typeof sdp === "object" ? sdp.type : undefined;
  const lines = text.split(/\r?\n/).length;
  const mLines = text
    .split(/\r?\n/)
    .filter((l) => l.startsWith("m="))
    .slice(0, 6);
  return { type, lines, bytes: text.length, mLines };
}

export function iceServersForLog(): { count: number; urls: string[] } {
  const servers = buildIceServersSnapshot();
  const urls: string[] = [];
  for (const s of servers) {
    const u = s.urls;
    if (typeof u === "string") urls.push(maskTurnUrl(u));
    else if (Array.isArray(u)) urls.push(...u.map(maskTurnUrl));
  }
  return { count: servers.length, urls };
}

function maskTurnUrl(url: string): string {
  if (url.startsWith("turn:") || url.startsWith("turns:")) {
    return url.replace(/(:[^:@/]+)(@|$)/, ":***$2");
  }
  return url;
}

function buildIceServersSnapshot(): RTCIceServer[] {
  const servers: RTCIceServer[] = [];
  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUser = import.meta.env.VITE_TURN_USERNAME;
  const turnPass = import.meta.env.VITE_TURN_PASSWORD;
  if (turnUrl && turnUser && turnPass) {
    servers.push({
      urls: [`${turnUrl}?transport=udp`, `${turnUrl}?transport=tcp`],
      username: turnUser,
      credential: "***",
    });
  }
  servers.push({ urls: "stun:stun.l.google.com:19302" });
  return servers;
}
