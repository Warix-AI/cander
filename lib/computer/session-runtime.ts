import { randomUUID } from "crypto";
import { Sandbox } from "@vercel/sandbox";
import { getSandboxCredentials } from "@agent-browser/sandbox/vercel";
import {
  bootstrapSpikeBrowser,
  type AgentBrowserSandbox,
} from "@/lib/computer/spike/agent-browser-bootstrap";
import { STREAM_PORT } from "@/lib/computer/spike/constants";
import type {
  ComputerSessionRecord,
  ControlMode,
} from "@/lib/computer/computer-provider";
import {
  getComputerSessionById,
  insertComputerSession,
  markComputerSessionStopped,
  updateComputerSession,
} from "@/lib/computer/session-store";

/** Short-lived process cache of resumed sandbox handles — not the source of truth. */
const sandboxCache: Map<string, AgentBrowserSandbox> = (() => {
  const g = globalThis as typeof globalThis & {
    __canderSandboxCache?: Map<string, AgentBrowserSandbox>;
  };
  if (!g.__canderSandboxCache) {
    g.__canderSandboxCache = new Map();
  }
  return g.__canderSandboxCache;
})();

type InputBridgeCacheEntry = {
  userId: string;
  streamUrl: string;
  controlMode: ControlMode;
};

/** Warm path for high-frequency mouse/keyboard input — invalidated on control changes. */
const inputBridgeCache: Map<string, InputBridgeCacheEntry> = (() => {
  const g = globalThis as typeof globalThis & {
    __canderInputBridgeCache?: Map<string, InputBridgeCacheEntry>;
  };
  if (!g.__canderInputBridgeCache) {
    g.__canderInputBridgeCache = new Map();
  }
  return g.__canderInputBridgeCache;
})();

const lastActivityBumpMs: Map<string, number> = (() => {
  const g = globalThis as typeof globalThis & {
    __canderLastActivityBumpMs?: Map<string, number>;
  };
  if (!g.__canderLastActivityBumpMs) {
    g.__canderLastActivityBumpMs = new Map();
  }
  return g.__canderLastActivityBumpMs;
})();
const ACTIVITY_BUMP_INTERVAL_MS = 30_000;

export function invalidateInputBridgeCache(sessionId: string): void {
  inputBridgeCache.delete(sessionId);
}

async function bumpSessionActivityThrottled(sessionId: string): Promise<void> {
  const now = Date.now();
  const last = lastActivityBumpMs.get(sessionId) ?? 0;
  if (now - last < ACTIVITY_BUMP_INTERVAL_MS) {
    return;
  }
  lastActivityBumpMs.set(sessionId, now);
  await updateComputerSession(sessionId, {
    last_active_at: new Date().toISOString(),
  });
}

async function getSessionRecordForInput(
  sessionId: string,
  userId: string,
): Promise<ComputerSessionRecord | null> {
  const record = await getComputerSessionById(sessionId, userId);
  if (!record) {
    return null;
  }
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
    return null;
  }
  if (record.status === "stopped" || record.status === "error") {
    return null;
  }
  return record;
}

export function createComputerSessionId(): string {
  return `cs_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function sandboxNameFor(record: ComputerSessionRecord): string {
  return record.providerSessionId ?? record.id;
}

export async function loadSessionRecord(
  sessionId: string,
  userId: string,
): Promise<ComputerSessionRecord | null> {
  const record = await getComputerSessionById(sessionId, userId);
  if (!record) {
    return null;
  }
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
    await stopSessionRecord(record);
    return null;
  }
  if (record.status === "stopped" || record.status === "error") {
    return null;
  }
  await updateComputerSession(sessionId, {
    last_active_at: new Date().toISOString(),
    status: record.status === "idle" ? "active" : record.status,
  });
  return record;
}

export async function resumeSandbox(
  record: ComputerSessionRecord,
): Promise<AgentBrowserSandbox> {
  const cached = sandboxCache.get(record.id);
  if (cached) {
    return cached;
  }

  const name = sandboxNameFor(record);
  try {
    const sandbox = (await Sandbox.get({
      ...getSandboxCredentials(),
      name,
      resume: true,
    })) as unknown as AgentBrowserSandbox;

    sandboxCache.set(record.id, sandbox);
    return sandbox;
  } catch (error) {
    // Surface a clearer error when the process cache is cold and Vercel
    // rejects resume (e.g. hobby usage limits).
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to resume sandbox ${name}: ${message}. Restart the spike session if the process cache was cleared.`,
    );
  }
}

export async function attachSandbox(
  record: ComputerSessionRecord,
): Promise<{ sandbox: AgentBrowserSandbox; streamUrl: string }> {
  const sandbox = await resumeSandbox(record);
  const streamUrl = sandbox.domain(STREAM_PORT);

  if (streamUrl !== record.streamUrl) {
    await updateComputerSession(record.id, {
      stream_url: streamUrl,
      status: "active",
      provider_session_id: sandboxNameFor(record),
    });
  }

  return { sandbox, streamUrl };
}

/** Resolve stream target from durable storage; reconnects sandbox by provider session id. */
export async function resolveStreamSession(
  sessionId: string,
  userId: string,
): Promise<{
  record: ComputerSessionRecord;
  streamUrl: string;
  controlMode: ControlMode;
} | null> {
  const record = await loadSessionRecord(sessionId, userId);
  if (!record) {
    return null;
  }

  try {
    const { streamUrl } = await attachSandbox(record);
    const fresh = (await getComputerSessionById(sessionId, userId)) ?? record;
    return {
      record: fresh,
      streamUrl,
      controlMode: fresh.controlMode,
    };
  } catch (error) {
    console.error("[computer] stream reconnect failed", sessionId, error);
    await updateComputerSession(sessionId, { status: "error" });
    return null;
  }
}

export async function resolveSandboxForSession(
  sessionId: string,
  userId: string,
): Promise<{ record: ComputerSessionRecord; sandbox: AgentBrowserSandbox } | null> {
  const record = await loadSessionRecord(sessionId, userId);
  if (!record) {
    return null;
  }
  const { sandbox } = await attachSandbox(record);
  const fresh = (await getComputerSessionById(sessionId, userId)) ?? record;
  return { record: fresh, sandbox };
}

/**
 * Reattach to the saved sandbox stream so input works even when this
 * process has no live StreamBridge (e.g. after a server restart).
 */
export async function resolveInputBridge(
  sessionId: string,
  userId: string,
): Promise<
  | { ok: true; record: ComputerSessionRecord; streamUrl: string }
  | { ok: false; error: string; status: number }
> {
  const { getOrCreateStreamBridge, getStreamBridgeState } = await import(
    "@/lib/computer/spike/stream-bridge"
  );

  const cached = inputBridgeCache.get(sessionId);
  if (
    cached &&
    cached.userId === userId &&
    cached.controlMode === "user" &&
    getStreamBridgeState(sessionId) === "connected"
  ) {
    const bridge = getOrCreateStreamBridge(sessionId, cached.streamUrl);
    const connected = await bridge.ensureConnected(1_500);
    if (connected) {
      void bumpSessionActivityThrottled(sessionId);
      const record = await getSessionRecordForInput(sessionId, userId);
      if (record && record.controlMode === "user") {
        return { ok: true, record, streamUrl: cached.streamUrl };
      }
      inputBridgeCache.delete(sessionId);
    }
  }

  const record = await getSessionRecordForInput(sessionId, userId);
  if (!record) {
    inputBridgeCache.delete(sessionId);
    return { ok: false, error: "Session not found.", status: 404 };
  }
  if (record.controlMode !== "user") {
    inputBridgeCache.delete(sessionId);
    return {
      ok: false,
      error: "Input only allowed in user control mode. Take control first.",
      status: 409,
    };
  }

  try {
    const { streamUrl } = await attachSandbox(record);
    const bridge = getOrCreateStreamBridge(sessionId, streamUrl);
    const connected = await bridge.ensureConnected();
    if (!connected) {
      inputBridgeCache.delete(sessionId);
      return {
        ok: false,
        error: "Could not reconnect to the browser stream. Try again.",
        status: 503,
      };
    }
    inputBridgeCache.set(sessionId, {
      userId,
      streamUrl,
      controlMode: "user",
    });
    void bumpSessionActivityThrottled(sessionId);
    const fresh = (await getComputerSessionById(sessionId, userId)) ?? record;
    return { ok: true, record: fresh, streamUrl };
  } catch (error) {
    inputBridgeCache.delete(sessionId);
    const message = error instanceof Error ? error.message : String(error);
    console.error("[computer] input reattach failed", sessionId, error);
    return {
      ok: false,
      error: `Failed to reattach sandbox for input: ${message}`,
      status: 503,
    };
  }
}

export async function setSessionControlMode(
  sessionId: string,
  userId: string,
  controlMode: ControlMode,
): Promise<ComputerSessionRecord | null> {
  const record = await loadSessionRecord(sessionId, userId);
  if (!record) {
    return null;
  }
  const updated = await updateComputerSession(sessionId, {
    control_mode: controlMode,
  });
  if (!updated) {
    console.error("[computer] failed to persist control_mode", {
      sessionId,
      controlMode,
    });
    return null;
  }
  invalidateInputBridgeCache(sessionId);
  return updated;
}

export async function persistSessionBootstrap(
  input: {
    sessionId: string;
    userId: string;
    scopeType: ComputerSessionRecord["scopeType"];
    scopeId: string;
    url: string;
    streamUrl: string;
    observation: { url: string; title: string; snapshot?: string };
    chatId?: string | null;
    projectId?: string | null;
    workspaceId?: string | null;
    taskId?: string | null;
  },
): Promise<ComputerSessionRecord> {
  const existing = await getComputerSessionById(input.sessionId, input.userId);
  if (existing) {
    const updated = await updateComputerSession(input.sessionId, {
      status: "active",
      stream_url: input.streamUrl,
      current_url: input.observation.url,
      provider_session_id: input.sessionId,
      browser_state: {
        title: input.observation.title,
        snapshotPreview: input.observation.snapshot?.slice(0, 500),
      },
    });
    return updated ?? existing;
  }

  return insertComputerSession({
    id: input.sessionId,
    user_id: input.userId,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    chat_id: input.chatId ?? null,
    project_id: input.projectId ?? null,
    workspace_id: input.workspaceId ?? null,
    task_id: input.taskId ?? null,
    provider: "vercel_sandbox",
    provider_session_id: input.sessionId,
    status: "active",
    control_mode: "agent",
    current_url: input.observation.url,
    stream_url: input.streamUrl,
    browser_state: {
      title: input.observation.title,
      snapshotPreview: input.observation.snapshot?.slice(0, 500),
    },
    build_state: null,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
}

export async function createAndBootstrapSession(input: {
  userId: string;
  scopeType: ComputerSessionRecord["scopeType"];
  scopeId: string;
  url: string;
  chatId?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  taskId?: string | null;
}): Promise<{
  record: ComputerSessionRecord;
  sandbox: AgentBrowserSandbox;
  streamUrl: string;
  observation: { url: string; title: string; snapshot: string };
}> {
  const sessionId = createComputerSessionId();
  const { sandbox, streamUrl, observation } = await bootstrapSpikeBrowser(
    input.url,
    sessionId,
  );

  sandboxCache.set(sessionId, sandbox);

  const record = await persistSessionBootstrap({
    sessionId,
    userId: input.userId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    url: input.url,
    streamUrl,
    observation,
    chatId: input.chatId,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    taskId: input.taskId,
  });

  return { record, sandbox, streamUrl, observation };
}

async function stopSessionRecord(record: ComputerSessionRecord): Promise<void> {
  sandboxCache.delete(record.id);
  try {
    const sandbox = await resumeSandbox(record);
    await sandbox.stop();
  } catch {
    // Sandbox may already be stopped.
  }
  await markComputerSessionStopped(record.id);
}

export async function stopSessionRecordById(
  sessionId: string,
  userId: string,
): Promise<void> {
  const record = await getComputerSessionById(sessionId, userId);
  if (!record) {
    return;
  }
  await stopSessionRecord(record);
}

export function evictSandboxCache(sessionId: string): void {
  sandboxCache.delete(sessionId);
}
