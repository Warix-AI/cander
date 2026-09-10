/**
 * Server-authoritative Website Build phase machine.
 * Only project-turn / server routes advance phase. Client cannot set ready.
 */

export const BUILD_PHASES = [
  "setup",
  "planning",
  "researching",
  "implementing",
  "validating",
  "booting",
  "preview_check",
  "visual_review",
  "ready",
  "failed",
] as const;

export type BuildPhase = (typeof BUILD_PHASES)[number];

/** Coarse UI status mirrored from build_phase. */
export type BriefStatusMirror = "setup" | "building" | "ready" | "failed";

export function isBuildPhase(value: unknown): value is BuildPhase {
  return (
    typeof value === "string" &&
    (BUILD_PHASES as readonly string[]).includes(value)
  );
}

/** Map legacy brief.status ↔ build_phase for UI compatibility. */
export function briefStatusFromBuildPhase(
  phase: BuildPhase | null | undefined,
): BriefStatusMirror {
  if (!phase) return "setup";
  if (phase === "ready") return "ready";
  if (phase === "failed") return "failed";
  if (phase === "setup") return "setup";
  return "building";
}

export function buildPhaseFromBriefStatus(
  status: BriefStatusMirror | null | undefined,
): BuildPhase {
  if (status === "ready") return "ready";
  if (status === "failed") return "failed";
  if (status === "setup") return "setup";
  if (status === "building") return "implementing";
  return "setup";
}

export async function getProjectBuildPhase(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<BuildPhase | null> {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("projects")
    .select("build_phase")
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();
  if (error || !data) return null;
  return isBuildPhase(data.build_phase) ? data.build_phase : null;
}

/**
 * Persist build_phase. Optionally keep website_setup_brief.status in sync.
 */
export async function setProjectBuildPhase(opts: {
  projectId: string;
  workspaceId: string;
  phase: BuildPhase;
  /** When true (default), mirror phase into brief.status for existing UI. */
  syncBriefStatus?: boolean;
}): Promise<void> {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    build_phase: opts.phase,
    updated_at: now,
  };

  if (opts.syncBriefStatus !== false) {
    const { data } = await admin
      .from("projects")
      .select("website_setup_brief")
      .eq("id", opts.projectId)
      .eq("workspace_id", opts.workspaceId)
      .maybeSingle();
    const brief =
      data?.website_setup_brief && typeof data.website_setup_brief === "object"
        ? { ...(data.website_setup_brief as Record<string, unknown>) }
        : {};
    brief.status = briefStatusFromBuildPhase(opts.phase);
    brief.updatedAt = now;
    patch.website_setup_brief = brief;
  }

  const { error } = await admin
    .from("projects")
    .update(patch)
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId);
  if (error) {
    console.warn("[cander:build-phase] set failed", {
      projectId: opts.projectId,
      phase: opts.phase,
      message: error.message,
    });
  } else {
    console.info("[cander:build-phase]", {
      projectId: opts.projectId,
      phase: opts.phase,
    });
  }
}

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
