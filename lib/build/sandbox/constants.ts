/** Build-app sandbox constants (one reusable Vercel Sandbox per project). */

/** Next/dev server port exposed from the sandbox (Phase 5 preview proxy). */
export const BUILD_APP_PORT = 3000;

function envMinutes(name: string, fallbackMinutes: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n * 60 * 1000 : fallbackMinutes * 60 * 1000;
}

/**
 * Running-session timeout for a build sandbox. The VM is persistent (its
 * filesystem is snapshotted and restored between sessions), so this only
 * bounds how long a session stays hot without user activity. Extended on
 * every interaction via `touchProjectRuntime`.
 */
export const BUILD_SANDBOX_TTL_MS = envMinutes("CANDER_SANDBOX_TTL_MIN", 120);

/** Idle window after which GC stops the running session (filesystem kept). */
export const BUILD_SANDBOX_IDLE_MS = envMinutes("CANDER_SANDBOX_IDLE_MIN", 40);

/** How long we keep the persistent sandbox record (and its snapshot) alive. */
export const BUILD_SANDBOX_RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Snapshot retention for persistent build sandboxes. */
export const BUILD_SANDBOX_SNAPSHOT_EXPIRATION_MS = BUILD_SANDBOX_RECORD_TTL_MS;

export const BUILD_SANDBOX_PURPOSE = "build_app" as const;

export type BuildSandboxStatus =
  | "idle"
  | "starting"
  | "ready"
  | "error"
  | "unavailable"
  | "needs_repo";

/**
 * User-facing runtime state. Never carries infrastructure detail — the UI
 * renders these words and nothing else; diagnostics stay in server logs.
 */
export type ProjectRuntimeState =
  | "starting"
  | "updating"
  | "ready"
  | "repairing"
  | "needs_retry"
  | "unavailable";

export type BuildSandboxState = {
  purpose: typeof BUILD_SANDBOX_PURPOSE;
  status: BuildSandboxStatus;
  githubFullName?: string;
  draftBranch?: string;
  draftSha?: string;
  /** Raw sandbox upstream for APP_PORT — server-side only in build_state. */
  previewUpstream?: string | null;
  /** True when the Vercel sandbox was created with `persistent: true`. */
  persistent?: boolean;
  message?: string;
  updatedAt: string;
};

export function runtimeStateFromStatus(
  status: BuildSandboxStatus,
  opts?: { repairing?: boolean },
): ProjectRuntimeState {
  if (opts?.repairing) return "repairing";
  switch (status) {
    case "ready":
      return "ready";
    case "starting":
    case "idle":
      return "starting";
    case "error":
      return "needs_retry";
    case "unavailable":
    case "needs_repo":
      return "unavailable";
    default:
      return "starting";
  }
}

/** Short copy for each runtime state (the only sandbox text users ever see). */
export const RUNTIME_STATE_COPY: Record<ProjectRuntimeState, string> = {
  starting: "Starting your preview…",
  updating: "Updating your preview…",
  ready: "Preview ready",
  repairing: "Fixing the preview…",
  needs_retry: "The preview didn’t start. Try again.",
  unavailable: "Preview isn’t available yet.",
};
