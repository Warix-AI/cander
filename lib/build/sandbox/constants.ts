/** Build-app sandbox constants (Vercel Sandbox disposable runtime). */

/** Next/dev server port exposed from the sandbox (Phase 5 preview proxy). */
export const BUILD_APP_PORT = 3000;

/** Idle / wall TTL for build sandboxes (~45m). */
export const BUILD_SANDBOX_TTL_MS = 45 * 60 * 1000;

export const BUILD_SANDBOX_PURPOSE = "build_app" as const;

export type BuildSandboxStatus =
  | "idle"
  | "starting"
  | "ready"
  | "error"
  | "unavailable"
  | "needs_repo";

export type BuildSandboxState = {
  purpose: typeof BUILD_SANDBOX_PURPOSE;
  status: BuildSandboxStatus;
  githubFullName?: string;
  draftBranch?: string;
  draftSha?: string;
  /** Raw sandbox upstream for APP_PORT — server-side only in build_state. */
  previewUpstream?: string | null;
  message?: string;
  updatedAt: string;
};
