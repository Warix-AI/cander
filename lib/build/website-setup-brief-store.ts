/**
 * Persist website setup brief on projects.website_setup_brief.
 * Server uses service role; browser uses the authenticated website-setup API
 * (build turns run client-side and must not call the admin client).
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  emptyWebsiteSetupBrief,
  normalizeWebsiteSetupBrief,
  type WebsiteSetupBrief,
} from "@/lib/ai/build/website-setup-brief";

const memoryBriefs = new Map<string, WebsiteSetupBrief>();

function memoryKey(projectId: string, workspaceId: string) {
  return `${workspaceId}:${projectId}`;
}

function isBrowser() {
  return typeof window !== "undefined";
}

async function browserAuthToken(): Promise<string | null> {
  try {
    const { createSupabaseBrowserClient } = await import(
      "@/lib/supabase/client"
    );
    const { isSupabaseConfigured } = await import("@/lib/data-backend");
    if (!isSupabaseConfigured()) return null;
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function loadWebsiteSetupBriefViaApi(
  projectId: string,
  workspaceId: string,
): Promise<WebsiteSetupBrief | null> {
  const token = await browserAuthToken();
  if (!token) return null;
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/website-setup?workspaceId=${encodeURIComponent(workspaceId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { brief?: unknown };
  return normalizeWebsiteSetupBrief(data.brief);
}

async function saveWebsiteSetupBriefViaApi(opts: {
  projectId: string;
  workspaceId: string;
  brief: WebsiteSetupBrief;
}): Promise<WebsiteSetupBrief | null> {
  const token = await browserAuthToken();
  if (!token) return null;
  const res = await fetch(
    `/api/projects/${encodeURIComponent(opts.projectId)}/website-setup`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceId: opts.workspaceId,
        brief: opts.brief,
        status: opts.brief.status,
        answers: opts.brief.answers,
        completedSteps: opts.brief.completedSteps,
      }),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { brief?: unknown };
  return normalizeWebsiteSetupBrief(data.brief);
}

export async function loadWebsiteSetupBrief(
  projectId: string,
  workspaceId: string,
): Promise<WebsiteSetupBrief> {
  const key = memoryKey(projectId, workspaceId);
  if (isBrowser()) {
    try {
      const viaApi = await loadWebsiteSetupBriefViaApi(projectId, workspaceId);
      if (viaApi) {
        memoryBriefs.set(key, viaApi);
        return viaApi;
      }
    } catch {
      // fall through to memory
    }
    return memoryBriefs.get(key)
      ? normalizeWebsiteSetupBrief(memoryBriefs.get(key))
      : emptyWebsiteSetupBrief();
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("projects")
      .select("website_setup_brief, kind")
      .eq("id", projectId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) {
      const mem = memoryBriefs.get(key);
      return mem ? normalizeWebsiteSetupBrief(mem) : emptyWebsiteSetupBrief();
    }
    if (!data) return emptyWebsiteSetupBrief();
    const brief = normalizeWebsiteSetupBrief(data.website_setup_brief);
    memoryBriefs.set(key, brief);
    return brief;
  } catch {
    return memoryBriefs.get(key)
      ? normalizeWebsiteSetupBrief(memoryBriefs.get(key))
      : emptyWebsiteSetupBrief();
  }
}

export async function saveWebsiteSetupBrief(opts: {
  projectId: string;
  workspaceId: string;
  brief: WebsiteSetupBrief;
  /**
   * Server-only: allow persisting status=ready after preview_check.
   * Browser / PATCH must never set ready — use /build/ready instead.
   */
  allowServerReady?: boolean;
}): Promise<WebsiteSetupBrief> {
  let next: WebsiteSetupBrief = {
    ...opts.brief,
    updatedAt: new Date().toISOString(),
  };

  // Fail closed: ready only via server finalize (preview_check + SHA pin).
  if (next.status === "ready" && !opts.allowServerReady) {
    next = { ...next, status: "building" };
  }

  // Server-side fail-closed: never persist ready without a runnable tip.
  if (!isBrowser() && next.status === "ready") {
    try {
      const { draftTipHasNextPackage } = await import(
        "@/lib/build/git/draft-tip"
      );
      const runnable = await draftTipHasNextPackage({
        projectId: opts.projectId,
        workspaceId: opts.workspaceId,
      });
      if (!runnable) {
        next = { ...next, status: "building" };
      }
    } catch (err) {
      console.warn("[cander] draft tip ready-gate failed; keeping building", err);
      next = { ...next, status: "building" };
    }
  }

  const key = memoryKey(opts.projectId, opts.workspaceId);
  memoryBriefs.set(key, next);

  if (isBrowser()) {
    try {
      const saved = await saveWebsiteSetupBriefViaApi({
        projectId: opts.projectId,
        workspaceId: opts.workspaceId,
        brief: next,
      });
      if (saved) {
        memoryBriefs.set(key, saved);
        return saved;
      }
      console.warn(
        "[cander] website_setup_brief browser save failed; preview may stay locked until refresh",
      );
    } catch (err) {
      console.warn("[cander] website_setup_brief browser save error", err);
    }
    return next;
  }

  try {
    const admin = createSupabaseAdminClient();
    const { buildPhaseFromBriefStatus, isBuildPhase } = await import(
      "@/lib/build/build-phase"
    );
    const mapped = buildPhaseFromBriefStatus(next.status);
    const { data: row } = await admin
      .from("projects")
      .select("build_phase")
      .eq("id", opts.projectId)
      .eq("workspace_id", opts.workspaceId)
      .maybeSingle();
    const current = isBuildPhase(row?.build_phase) ? row!.build_phase : null;
    const fineGrained =
      current === "booting" ||
      current === "preview_check" ||
      current === "visual_review" ||
      current === "ready";
    // Don't clobber server machine phases with coarse "building" → implementing.
    const patch: Record<string, unknown> = {
      website_setup_brief: next,
      updated_at: next.updatedAt,
    };
    if (
      next.status === "ready" ||
      next.status === "failed" ||
      next.status === "setup" ||
      !(fineGrained && next.status === "building")
    ) {
      patch.build_phase = mapped;
    }
    const { error } = await admin
      .from("projects")
      .update(patch)
      .eq("id", opts.projectId)
      .eq("workspace_id", opts.workspaceId);
    if (error) {
      console.warn("[cander] website_setup_brief save failed", error.message);
    }
  } catch (err) {
    console.warn("[cander] website_setup_brief save error", err);
  }
  return next;
}

export async function getProjectKindForSetup(
  projectId: string,
  workspaceId: string,
): Promise<string | null> {
  // Browser build turns pass projectKind on the request; avoid admin client.
  if (isBrowser()) return null;

  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("projects")
      .select("kind")
      .eq("id", projectId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    return data?.kind ? String(data.kind) : null;
  } catch {
    return null;
  }
}
