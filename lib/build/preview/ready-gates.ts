/**
 * Pure ready gates for Website Build (Phase 6 / Phase 3 contract).
 * Safe for node:test — no path aliases.
 */

export function normalizeSha(sha: string | null | undefined): string {
  return (sha || "").trim().toLowerCase();
}

export function sandboxMatchesProjectTip(opts: {
  sandboxDraftSha: string | null | undefined;
  projectDraftSha: string | null | undefined;
}): boolean {
  const a = normalizeSha(opts.sandboxDraftSha);
  const b = normalizeSha(opts.projectDraftSha);
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

export function canMarkBuildReady(opts: {
  projectDraftSha: string | null | undefined;
  sandboxDraftSha: string | null | undefined;
  previewCheckOk: boolean;
  /** Phase immediately before ready transition. */
  phaseBeforeReady?: string | null;
}): { ok: boolean; reason: string | null } {
  if (!opts.projectDraftSha) {
    return { ok: false, reason: "No draft tip SHA." };
  }
  if (!opts.previewCheckOk) {
    return { ok: false, reason: "preview_check has not passed." };
  }
  if (
    !sandboxMatchesProjectTip({
      sandboxDraftSha: opts.sandboxDraftSha,
      projectDraftSha: opts.projectDraftSha,
    })
  ) {
    return {
      ok: false,
      reason: "Sandbox tip SHA does not match project draft_sha.",
    };
  }
  if (
    opts.phaseBeforeReady &&
    opts.phaseBeforeReady !== "preview_check" &&
    opts.phaseBeforeReady !== "visual_review"
  ) {
    return {
      ok: false,
      reason: `Cannot enter ready from phase ${opts.phaseBeforeReady}.`,
    };
  }
  return { ok: true, reason: null };
}

/** Keys allowed when syncing draft tip — must never include published_*. */
export const DRAFT_TIP_SYNC_PROJECT_KEYS = [
  "draft_sha",
  "draft_branch",
  "updated_at",
  "draft_revision_id",
] as const;

export function draftTipSyncTouchesPublished(
  patchKeys: readonly string[],
): boolean {
  return patchKeys.some(
    (k) =>
      k === "published_sha" ||
      k === "published_url" ||
      k.startsWith("published_") ||
      k.startsWith("vercel_production_"),
  );
}
