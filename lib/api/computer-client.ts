"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  BrowserObservation,
  ComputerScopeType,
  ComputerSessionRecord,
  ControlMode,
} from "@/lib/computer/computer-provider";
import type { StreamConnectionState } from "@/lib/computer/spike/types";

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

export async function createComputerSession(opts: {
  scopeType: ComputerScopeType;
  scopeId: string;
  chatId?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  url?: string;
}): Promise<{ ok: boolean; session?: ComputerSessionRecord; error?: string }> {
  const headers = await authHeaders();
  const response = await fetch("/api/computer/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(opts),
  });
  const data = await response.json();
  if (!response.ok) {
    return { ok: false, error: data.error ?? "Failed to create computer session." };
  }
  return { ok: true, session: data.session };
}

export async function computerBrowserAction(opts: {
  sessionId: string;
  action: "open" | "navigate" | "observe" | "click" | "fill";
  url?: string;
  ref?: string;
  value?: string;
}): Promise<{ ok: boolean; observation?: BrowserObservation; error?: string }> {
  const headers = await authHeaders();
  const response = await fetch("/api/computer/browser", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(opts),
  });
  const data = await response.json();
  if (!response.ok) {
    return { ok: false, error: data.error ?? "Browser action failed." };
  }
  return data;
}

export async function setComputerControlMode(
  sessionId: string,
  controlMode: ControlMode,
): Promise<{ ok: boolean; controlMode?: ControlMode; error?: string }> {
  const headers = await authHeaders();
  const response = await fetch("/api/computer/control", {
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

export async function sendComputerInput(
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const headers = await authHeaders();
  const response = await fetch("/api/computer/input", {
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

export function openComputerStream(
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
      `/api/computer/stream?sessionId=${encodeURIComponent(sessionId)}`,
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
        // ignore
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

export async function restoreProjectToComputer(
  sessionId: string,
  projectId: string,
): Promise<{ ok: boolean; fileCount?: number; error?: string }> {
  const headers = await authHeaders();
  const response = await fetch("/api/computer/exec", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ sessionId, action: "restore_project", projectId }),
  });
  const data = await response.json();
  if (!response.ok) {
    return { ok: false, error: data.error ?? "Restore failed." };
  }
  return { ok: true, fileCount: data.fileCount };
}

export async function computerExec(
  sessionId: string,
  command: string,
  args: string[] = [],
): Promise<{ ok: boolean; stdout?: string; stderr?: string; exitCode?: number; error?: string }> {
  const headers = await authHeaders();
  const response = await fetch("/api/computer/exec", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ sessionId, command, args }),
  });
  const data = await response.json();
  if (!response.ok) {
    return { ok: false, error: data.error ?? "Exec failed." };
  }
  return data;
}
