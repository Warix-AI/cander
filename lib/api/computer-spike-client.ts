"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BrowserObservation } from "@/lib/computer/spike/types";
import type { ControlMode, StreamConnectionState } from "@/lib/computer/spike/types";

export type SpikeStartResult = {
  ok: boolean;
  sessionId?: string;
  streamUrl?: string;
  controlMode?: ControlMode;
  observation?: BrowserObservation;
  error?: string;
};

async function authHeaders(): Promise<HeadersInit> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

export async function startComputerSpike(url?: string): Promise<SpikeStartResult> {
  const headers = await authHeaders();
  const response = await fetch("/api/computer/spike/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ url }),
  });
  const data = (await response.json()) as SpikeStartResult;
  if (!response.ok) {
    return { ok: false, error: data.error ?? "Failed to start computer spike." };
  }
  return data;
}

export async function fetchComputerSpikeSnapshot(
  sessionId: string,
): Promise<{ ok: boolean; observation?: BrowserObservation; error?: string }> {
  const headers = await authHeaders();
  const response = await fetch("/api/computer/spike/snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ sessionId }),
  });
  const data = await response.json();
  if (!response.ok) {
    return { ok: false, error: data.error ?? "Snapshot failed." };
  }
  return data;
}

export async function runComputerSpikeAgentAction(
  sessionId: string,
  action: "click" | "fill" | "press" | "scroll",
  ref: string,
  value?: string,
): Promise<{ ok: boolean; observation?: BrowserObservation; error?: string }> {
  const headers = await authHeaders();
  const response = await fetch("/api/computer/spike/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ sessionId, action, ref, value }),
  });
  const data = await response.json();
  if (!response.ok) {
    return { ok: false, error: data.error ?? "Agent action failed." };
  }
  return data;
}

export async function setComputerSpikeControlMode(
  sessionId: string,
  controlMode: ControlMode,
): Promise<{ ok: boolean; controlMode?: ControlMode; error?: string }> {
  const headers = await authHeaders();
  const response = await fetch("/api/computer/spike/control", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ sessionId, controlMode }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    return { ok: false, error: data.error ?? "Control mode change failed." };
  }
  return { ok: true, controlMode: data.controlMode ?? controlMode };
}

export async function sendComputerSpikeInput(
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const headers = await authHeaders();
  const response = await fetch("/api/computer/spike/input", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ sessionId, ...payload }),
  });
  const data = await response.json();
  if (!response.ok) {
    return { ok: false, error: data.error ?? "Input failed." };
  }
  return { ok: true };
}

export function openComputerSpikeStream(
  sessionId: string,
  handlers: {
    onFrame: (frame: { data: string; metadata?: Record<string, number> }) => void;
    onStatus: (status: {
      connectionState: StreamConnectionState;
      controlMode?: ControlMode;
    }) => void;
    onError?: (error: string) => void;
  },
): () => void {
  let source: EventSource | null = null;
  let reconnectAttempt = 0;
  let disposed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (disposed) {
      return;
    }
    handlers.onStatus({
      connectionState: reconnectAttempt > 0 ? "reconnecting" : "connecting",
    });

    source = new EventSource(
      `/api/computer/spike/stream?sessionId=${encodeURIComponent(sessionId)}`,
    );

    source.addEventListener("frame", (event) => {
      reconnectAttempt = 0;
      handlers.onStatus({ connectionState: "connected" });
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as {
          type?: string;
          data?: string;
          metadata?: Record<string, number>;
        };
        if (parsed.type === "frame" && parsed.data) {
          handlers.onFrame({ data: parsed.data, metadata: parsed.metadata });
        }
      } catch {
        handlers.onError?.("Failed to parse frame.");
      }
    });

    source.addEventListener("status", (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as {
          connectionState?: StreamConnectionState;
          controlMode?: ControlMode;
        };
        handlers.onStatus({
          connectionState: parsed.connectionState ?? "connected",
          controlMode: parsed.controlMode,
        });
      } catch {
        // Ignore malformed status events.
      }
    });

    source.onerror = () => {
      source?.close();
      source = null;
      if (disposed) {
        handlers.onStatus({ connectionState: "disconnected" });
        return;
      }
      const delay = Math.min(500 * 2 ** reconnectAttempt, 30_000);
      reconnectAttempt += 1;
      handlers.onStatus({ connectionState: "reconnecting" });
      reconnectTimer = setTimeout(connect, delay);
    };
  };

  connect();

  return () => {
    disposed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    source?.close();
    handlers.onStatus({ connectionState: "disconnected" });
  };
}
