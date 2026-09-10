/**
 * Project runtime façade — the ONLY entry point product code should use to
 * obtain, refresh, repair or reset a project's sandbox.
 *
 * Invariants:
 * - One reusable VM per project. `connect` and `repair` never create a second
 *   VM while the current one is alive; only `reset` (explicit) and dead-VM
 *   detection inside `lifecycle.ts` recreate.
 * - `repair` escalates from the cheapest fix upward: probe → restart the dev
 *   server → reinstall deps → recreate.
 * - Callers get a user-safe `state`; raw diagnostics go to server logs only.
 *
 * Server-only. Callers must assertProjectAccess first.
 */

import {
  BUILD_APP_PORT,
  RUNTIME_STATE_COPY,
  runtimeStateFromStatus,
  type ProjectRuntimeState,
} from "@/lib/build/sandbox/constants";
import {
  ensureProjectSandbox,
  getProjectSandboxStatus,
  touchProjectSandbox,
  type EnsureProjectSandboxResult,
} from "@/lib/build/sandbox/lifecycle";
import { coalesceEnsureProjectSandbox } from "@/lib/build/sandbox/ensure-coalesce";

export type RuntimeMode = "connect" | "repair" | "reset";

export type ProjectRuntimeResult = EnsureProjectSandboxResult & {
  /** User-safe state; the UI should key its copy off this. */
  state: ProjectRuntimeState;
  /** Short, infrastructure-free copy for the state. */
  stateMessage: string;
  /** Which repair step (if any) resolved this call. */
  repairStep?: "none" | "dev_server" | "reinstall" | "recreate";
};

type RuntimeOpts = { userId: string; projectId: string; workspaceId: string };

/**
 * Raw `message` values from lifecycle mention npm, git, HTTP codes, etc.
 * Log them, never send them to the browser.
 */
export function toRuntimeResult(
  r: EnsureProjectSandboxResult,
  extra?: { repairing?: boolean; repairStep?: ProjectRuntimeResult["repairStep"] },
): ProjectRuntimeResult {
  const state = runtimeStateFromStatus(r.status, { repairing: extra?.repairing });
  if (r.message && r.status === "error") {
    console.info("[cander:runtime] diagnostic", {
      projectId: r.projectId,
      sessionId: r.sessionId,
      diagnostic: r.message.slice(0, 500),
    });
  }
  return {
    ...r,
    message: RUNTIME_STATE_COPY[state],
    state,
    stateMessage: RUNTIME_STATE_COPY[state],
    repairStep: extra?.repairStep ?? "none",
  };
}

function ensure(opts: RuntimeOpts, forceRestart: boolean) {
  return coalesceEnsureProjectSandbox({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    forceRestart,
    run: () => ensureProjectSandbox({ ...opts, forceRestart }),
  });
}

/** Get (resume or first-create) the project's runtime. Never destroys. */
export async function connectProjectRuntime(opts: RuntimeOpts): Promise<ProjectRuntimeResult> {
  const r = await ensure(opts, false);
  if (r.sessionId) void touchProjectSandbox({ sessionId: r.sessionId, userId: opts.userId });
  return toRuntimeResult(r);
}

/** Read-only status (no VM work beyond a cheap probe). */
export async function getProjectRuntimeStatus(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<ProjectRuntimeResult> {
  return toRuntimeResult(await getProjectSandboxStatus(opts));
}

async function probeAppPort(sessionId: string, userId: string): Promise<number> {
  const { runPrivilegedSandboxCommand } = await import("@/lib/build/sandbox/privileged");
  const res = await runPrivilegedSandboxCommand({
    sessionId,
    userId,
    cmd: "sh",
    args: [
      "-c",
      `curl -s -o /dev/null -w "%{http_code}" --max-time 4 http://127.0.0.1:${BUILD_APP_PORT}/ 2>/dev/null || echo 000`,
    ],
  });
  const code = (res.stdout || "").trim().split(/\s+/).pop() || "";
  return /^\d{3}$/.test(code) ? Number(code) : 0;
}

async function killDevServer(sessionId: string, userId: string): Promise<void> {
  const { runPrivilegedSandboxCommand } = await import("@/lib/build/sandbox/privileged");
  await runPrivilegedSandboxCommand({
    sessionId,
    userId,
    cmd: "sh",
    args: [
      "-c",
      [
        // Kill whatever holds the app port plus any next dev processes.
        `for p in $(ss -ltnp 2>/dev/null | grep ":${BUILD_APP_PORT} " | sed -n 's/.*pid=\\([0-9]*\\).*/\\1/p' | sort -u); do kill "$p" 2>/dev/null || true; done`,
        "pkill -f 'next dev' 2>/dev/null || true",
        "pkill -f 'next-server' 2>/dev/null || true",
        "sleep 1",
        "echo KILLED",
      ].join("; "),
    ],
  }).catch(() => undefined);
}

/**
 * Restart only the dev server (cheapest repair). Returns true when the app
 * port answers healthily afterwards.
 */
export async function restartProjectDevServer(opts: RuntimeOpts & { sessionId: string }): Promise<boolean> {
  const { ensureSandboxDevServer } = await import("@/lib/build/preview/dev-server");
  await killDevServer(opts.sessionId, opts.userId);
  const dev = await ensureSandboxDevServer({ sessionId: opts.sessionId, userId: opts.userId });
  return dev.ready;
}

async function reinstallDeps(opts: RuntimeOpts & { sessionId: string }): Promise<boolean> {
  const { runPrivilegedSandboxCommand } = await import("@/lib/build/sandbox/privileged");
  const res = await runPrivilegedSandboxCommand({
    sessionId: opts.sessionId,
    userId: opts.userId,
    cmd: "sh",
    args: [
      "-c",
      "rm -rf .next node_modules/.cache 2>/dev/null; npm install --no-fund --no-audit > /tmp/cander-npm-install.log 2>&1; echo \"__EXIT:$?\"",
    ],
  }).catch(() => null);
  return Boolean(res && /__EXIT:0/.test(res.stdout || ""));
}

/**
 * Escalating repair. Each step is tried once and the VM is only recreated as
 * the last resort (or immediately when lifecycle detects it is dead).
 */
export async function repairProjectRuntime(opts: RuntimeOpts): Promise<ProjectRuntimeResult> {
  // Step 0: a plain connect handles dead/expired VMs, tip drift and a dev
  // server that merely needs starting.
  const connected = await ensure(opts, false);
  if (connected.status === "ready" && connected.sessionId && connected.hasPreviewUpstream) {
    try {
      const code = await probeAppPort(connected.sessionId, opts.userId);
      if (code >= 200 && code < 400) {
        return toRuntimeResult(connected, { repairStep: "none" });
      }
    } catch {
      /* fall through to restart */
    }
  }
  if (connected.status === "unavailable" || connected.status === "needs_repo") {
    return toRuntimeResult(connected);
  }

  const sessionId = connected.sessionId;
  if (sessionId) {
    // Step 1: restart the dev server in place.
    try {
      if (await restartProjectDevServer({ ...opts, sessionId })) {
        const r = await ensure(opts, false);
        if (r.status === "ready") return toRuntimeResult(r, { repairStep: "dev_server" });
      }
    } catch (err) {
      console.warn("[cander:runtime] dev server restart failed", err instanceof Error ? err.message : err);
    }
    // Step 2: reinstall deps + clear caches, then restart.
    try {
      if (await reinstallDeps({ ...opts, sessionId })) {
        if (await restartProjectDevServer({ ...opts, sessionId })) {
          const r = await ensure(opts, false);
          if (r.status === "ready") return toRuntimeResult(r, { repairStep: "reinstall" });
        }
      }
    } catch (err) {
      console.warn("[cander:runtime] reinstall failed", err instanceof Error ? err.message : err);
    }
  }

  // Step 3: recreate from git (lifecycle refuses while a job is active).
  console.info("[cander:runtime] escalating to recreate", { projectId: opts.projectId, sessionId });
  const recreated = await ensure(opts, true);
  return toRuntimeResult(recreated, { repairStep: "recreate" });
}

/** Explicit, user-intended reset: destroy the VM and clone fresh from git. */
export async function resetProjectRuntime(opts: RuntimeOpts): Promise<ProjectRuntimeResult> {
  return toRuntimeResult(await ensure(opts, true), { repairStep: "recreate" });
}

/** Keep the VM warm after an interaction (fire-and-forget safe). */
export async function touchProjectRuntime(opts: RuntimeOpts): Promise<void> {
  const status = await getProjectSandboxStatus(opts);
  if (status.sessionId) await touchProjectSandbox({ sessionId: status.sessionId, userId: opts.userId });
}

export async function runProjectRuntime(
  opts: RuntimeOpts & { mode: RuntimeMode },
): Promise<ProjectRuntimeResult> {
  switch (opts.mode) {
    case "repair":
      return repairProjectRuntime(opts);
    case "reset":
      return resetProjectRuntime(opts);
    default:
      return connectProjectRuntime(opts);
  }
}
