/**
 * User-facing publish states. The only publish text users ever see comes from
 * here — provider, git, build and sandbox details stay in attempts.error /
 * server logs. Safe to import from client code (no server deps).
 */

export type PublishUserState =
  | "idle"
  | "publishing"
  | "live"
  | "busy"
  | "fixing"
  | "restored"
  | "needs_fix"
  | "needs_retry";

export const PUBLISH_STATE_COPY: Record<PublishUserState, string> = {
  idle: "",
  publishing: "Publishing your site…",
  live: "Your site is live.",
  busy: "A change is still being applied. Publish again once it’s done.",
  fixing: "Fixing a small issue, then publishing automatically…",
  restored:
    "The new version didn’t respond correctly, so your previous live version was kept. Ask Cander to fix it, then publish again.",
  needs_fix:
    "Your draft needs a quick fix before it can go live. Ask Cander to fix it, then publish again.",
  needs_retry: "Publishing didn’t finish. Try again.",
};

export type PublishAttemptLite = {
  status: string;
  meta?: Record<string, unknown> | null;
  stale?: boolean;
};

export function publishUserStateFromAttempt(
  attempt: PublishAttemptLite | null | undefined,
): PublishUserState {
  if (!attempt) return "idle";
  if (attempt.stale) return "needs_retry";
  switch (attempt.status) {
    case "pending":
    case "preflight":
    case "deploying":
      return "publishing";
    case "published":
    case "git_sync_repair":
      return "live";
    case "failed": {
      const meta = (attempt.meta ?? {}) as {
        draftNeedsRepair?: boolean;
        reason?: string;
        autoFixJobId?: string;
        healthFailures?: unknown[];
        restored?: boolean;
      };
      if (meta.reason === "build_in_progress") return "busy";
      if (meta.autoFixJobId) return "fixing";
      if (meta.restored) return "restored";
      return meta.draftNeedsRepair ? "needs_fix" : "needs_retry";
    }
    default:
      return "idle";
  }
}

/** Classify a raw publish error into the user state (for synchronous paths). */
export function publishUserStateFromError(raw: string | null | undefined): PublishUserState {
  const text = raw || "";
  const draftNeedsRepair =
    /draft needs repair|Publish blocked|preflight|robots|sitemap|package\.json|App Router|Typecheck|next build failed|Missing dependency|Unresolved import|Ask Cander to repair/i.test(
      text,
    ) && !/VERCEL_TOKEN|GitHub App is not configured|rate limit|503|unavailable/i.test(text);
  return draftNeedsRepair ? "needs_fix" : "needs_retry";
}
