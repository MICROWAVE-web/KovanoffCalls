import type { SignalingIncoming, SignalingOutgoing } from "./types";

type Listener = (msg: SignalingIncoming) => void;

const WS_BASE = import.meta.env.VITE_WS_BASE_URL ?? "";
const HEARTBEAT_INTERVAL = 25_000;
const RECONNECT_BASE_DELAY = 1_000;
const RECONNECT_MAX_DELAY = 15_000;

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
    this.openSocket();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
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
    const url = `${WS_BASE}/ws?token=${encodeURIComponent(this.token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.emitConnected(true);
      this.flushOutbox();
      this.startHeartbeat();
    };

    ws.onmessage = (event) => {
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

    ws.onclose = () => {
      this.stopHeartbeat();
      this.ws = null;
      this.emitConnected(false);
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
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
