import WebSocket from "ws";
import type { StreamConnectionState } from "@/lib/computer/spike/types";

type FrameListener = (rawMessage: string) => void;

const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 500;

function toWebSocketUrl(httpsUrl: string): string {
  if (httpsUrl.startsWith("wss://") || httpsUrl.startsWith("ws://")) {
    return httpsUrl;
  }
  return httpsUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}

class StreamBridge {
  private upstream: WebSocket | null = null;
  private listeners = new Set<FrameListener>();
  private state: StreamConnectionState = "disconnected";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private readonly sessionId: string,
    private streamUrl: string,
  ) {}

  getState(): StreamConnectionState {
    return this.state;
  }

  subscribe(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.clearReconnectTimer();
    this.state = this.reconnectAttempt > 0 ? "reconnecting" : "connecting";

    const wsUrl = toWebSocketUrl(this.streamUrl);
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: { Origin: "http://localhost" },
      });
      this.upstream = ws;

      ws.on("open", () => {
        this.state = "connected";
        this.reconnectAttempt = 0;
        ws.send(JSON.stringify({ type: "status" }));
        resolve();
      });

      ws.on("message", (data) => {
        const raw = data.toString();
        for (const listener of this.listeners) {
          listener(raw);
        }
      });

      ws.on("close", () => {
        this.upstream = null;
        if (this.disposed) {
          this.state = "disconnected";
          return;
        }
        this.scheduleReconnect();
      });

      ws.on("error", (error) => {
        if (this.state === "connecting") {
          reject(error);
          return;
        }
        this.scheduleReconnect();
      });
    }).catch(() => {
      this.scheduleReconnect();
    });
  }

  /** Returns true only when the upstream WebSocket accepted the message. */
  send(message: string): boolean {
    if (this.upstream?.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.upstream.send(message);
    return true;
  }

  async ensureConnected(timeoutMs = 8_000): Promise<boolean> {
    if (this.disposed) {
      return false;
    }
    if (this.state === "connected" && this.upstream?.readyState === WebSocket.OPEN) {
      return true;
    }
    if (this.state === "disconnected" || this.state === "reconnecting") {
      void this.connect();
    }
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (this.state === "connected" && this.upstream?.readyState === WebSocket.OPEN) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return this.state === "connected" && this.upstream?.readyState === WebSocket.OPEN;
  }

  async sendReliable(message: string): Promise<boolean> {
    const connected = await this.ensureConnected();
    if (!connected) {
      return false;
    }
    return this.send(message);
  }

  updateStreamUrl(streamUrl: string): void {
    this.streamUrl = streamUrl;
  }

  disconnect(): void {
    this.disposed = true;
    this.clearReconnectTimer();
    this.state = "disconnected";
    if (this.upstream) {
      this.upstream.close();
      this.upstream = null;
    }
    this.listeners.clear();
  }

  private scheduleReconnect(): void {
    if (this.disposed) {
      return;
    }
    this.state = "reconnecting";
    this.clearReconnectTimer();
    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempt,
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

const bridges: Map<string, StreamBridge> = (() => {
  const g = globalThis as typeof globalThis & {
    __canderStreamBridges?: Map<string, StreamBridge>;
  };
  if (!g.__canderStreamBridges) {
    g.__canderStreamBridges = new Map();
  }
  return g.__canderStreamBridges;
})();

export function getOrCreateStreamBridge(
  sessionId: string,
  streamUrl: string,
): StreamBridge {
  let bridge = bridges.get(sessionId);
  if (!bridge) {
    bridge = new StreamBridge(sessionId, streamUrl);
    bridges.set(sessionId, bridge);
    void bridge.connect();
    return bridge;
  }
  bridge.updateStreamUrl(streamUrl);
  if (bridge.getState() === "disconnected") {
    void bridge.connect();
  }
  return bridge;
}

export function getStreamBridge(sessionId: string): StreamBridge | null {
  return bridges.get(sessionId) ?? null;
}

export function removeStreamBridge(sessionId: string): void {
  const bridge = bridges.get(sessionId);
  if (bridge) {
    bridge.disconnect();
    bridges.delete(sessionId);
  }
}

export function getStreamBridgeState(
  sessionId: string,
): StreamConnectionState {
  return bridges.get(sessionId)?.getState() ?? "disconnected";
}
