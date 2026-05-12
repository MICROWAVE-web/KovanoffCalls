import type { SignalingIncoming, SignalingOutgoing } from "./types";

type Listener = (msg: SignalingIncoming) => void;

const WS_BASE = import.meta.env.VITE_WS_BASE_URL ?? "";
const HEARTBEAT_INTERVAL = 25_000;
const RECONNECT_BASE_DELAY = 1_000;
const RECONNECT_MAX_DELAY = 15_000;

// 1000 = normal closure (server told us to go away on purpose; don't reconnect).
// 1008 = policy violation (auth rejected; reconnecting won't help).
const NO_RECONNECT_CODES = new Set<number>([1000, 1008]);

export class SignalingClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private listeners = new Set<Listener>();
  private connectedListeners = new Set<(connected: boolean) => void>();
  private heartbeatTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private shouldReconnect = true;
  private outbox: SignalingOutgoing[] = [];

  connect(token: string): void {
    this.token = token;
    this.shouldReconnect = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return;
    }
    this.openSocket();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        ws.close(1000, "client disconnect");
      } catch {
        // ignore
      }
    }
    this.emitConnected(false);
  }

  send(message: SignalingOutgoing): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.outbox.push(message);
    }
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onConnection(listener: (connected: boolean) => void): () => void {
    this.connectedListeners.add(listener);
    return () => this.connectedListeners.delete(listener);
  }

  private openSocket(): void {
    if (!this.token) return;
    if (this.ws) {
      try {
        this.ws.close(1000, "superseded by new socket");
      } catch {
        // ignore
      }
    }
    const url = `${WS_BASE}/ws?token=${encodeURIComponent(this.token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.reconnectAttempt = 0;
      this.emitConnected(true);
      this.flushOutbox();
      this.startHeartbeat();
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      let parsed: SignalingIncoming;
      try {
        parsed = JSON.parse(event.data) as SignalingIncoming;
      } catch {
        return;
      }
      this.listeners.forEach((l) => {
        try {
          l(parsed);
        } catch (err) {
          console.error("signaling listener error", err);
        }
      });
    };

    ws.onclose = (event) => {
      // If a newer socket has already replaced us, just exit quietly.
      if (this.ws !== ws) return;
      this.stopHeartbeat();
      this.ws = null;
      this.emitConnected(false);
      if (!this.shouldReconnect) return;
      if (NO_RECONNECT_CODES.has(event.code)) return;
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // close handler will run after this
    };
  }

  private flushOutbox(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    while (this.outbox.length > 0) {
      const next = this.outbox.shift();
      if (next) this.ws.send(JSON.stringify(next));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.send({ type: "ping" });
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectAttempt += 1;
    const delay = Math.min(
      RECONNECT_MAX_DELAY,
      RECONNECT_BASE_DELAY * 2 ** Math.min(this.reconnectAttempt - 1, 4),
    );
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private emitConnected(connected: boolean): void {
    this.connectedListeners.forEach((l) => {
      try {
        l(connected);
      } catch (err) {
        console.error("connection listener error", err);
      }
    });
  }
}

export const signaling = new SignalingClient();
