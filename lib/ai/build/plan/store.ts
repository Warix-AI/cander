/**
 * Persist plan-first artifacts on projects.* jsonb columns.
 * Server uses service role; browser uses /api/projects/:id/build-plan.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  BuildPlanRecord,
  ImplementationManifest,
  PlanFirstArtifacts,
  ProjectSpec,
  ResearchManifest,
} from "@/lib/ai/build/plan/types";
import {
  normalizeBuildPlanRecord,
  normalizeImplementationManifest,
  normalizeProjectSpec,
  normalizeResearchManifest,
} from "@/lib/ai/build/plan/normalize";

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

export async function loadPlanFirstArtifacts(
  projectId: string,
  workspaceId: string,
): Promise<PlanFirstArtifacts> {
  if (isBrowser()) {
    try {
      const token = await browserAuthToken();
      if (!token) {
        return {
          projectSpec: null,
          buildPlan: null,
          researchManifest: null,
          implementationManifest: null,
        };
      }
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/build-plan?workspaceId=${encodeURIComponent(workspaceId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      if (!res.ok) {
        return {
          projectSpec: null,
          buildPlan: null,
          researchManifest: null,
          implementationManifest: null,
        };
      }
      const data = (await res.json()) as {
        projectSpec?: unknown;
        buildPlan?: unknown;
        researchManifest?: unknown;
        implementationManifest?: unknown;
      };
      return {
        projectSpec: normalizeProjectSpec(data.projectSpec),
        buildPlan: normalizeBuildPlanRecord(data.buildPlan),
        researchManifest: normalizeResearchManifest(data.researchManifest),
        implementationManifest: data.implementationManifest
          ? normalizeImplementationManifest(data.implementationManifest)
          : null,
      };
    } catch {
      return {
        projectSpec: null,
        buildPlan: null,
        researchManifest: null,
        implementationManifest: null,
      };
    }
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("projects")
      .select(
        "project_spec, build_plan, research_manifest, implementation_manifest",
      )
      .eq("id", projectId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error || !data) {
      return {
        projectSpec: null,
        buildPlan: null,
        researchManifest: null,
        implementationManifest: null,
      };
    }
    return {
      projectSpec: normalizeProjectSpec(data.project_spec),
      buildPlan: normalizeBuildPlanRecord(data.build_plan),
      researchManifest: normalizeResearchManifest(data.research_manifest),
      implementationManifest: data.implementation_manifest
        ? normalizeImplementationManifest(data.implementation_manifest)
        : null,
    };
  } catch {
    return {
      projectSpec: null,
      buildPlan: null,
      researchManifest: null,
      implementationManifest: null,
    };
  }
}

export async function savePlanFirstArtifacts(opts: {
  projectId: string;
  workspaceId: string;
  projectSpec?: ProjectSpec | null;
  buildPlan?: BuildPlanRecord | null;
  researchManifest?: ResearchManifest | null;
  implementationManifest?: ImplementationManifest | null;
}): Promise<PlanFirstArtifacts> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (opts.projectSpec !== undefined) {
    patch.project_spec = opts.projectSpec;
  }
  if (opts.buildPlan !== undefined) {
    patch.build_plan = opts.buildPlan
      ? {
          ...opts.buildPlan,
          updatedAt: new Date().toISOString(),
        }
      : null;
  }
  if (opts.researchManifest !== undefined) {
    patch.research_manifest = opts.researchManifest
      ? {
          ...opts.researchManifest,
          updatedAt: new Date().toISOString(),
        }
      : null;
  }
  if (opts.implementationManifest !== undefined) {
    patch.implementation_manifest = opts.implementationManifest
      ? {
          ...opts.implementationManifest,
          updatedAt: new Date().toISOString(),
        }
      : null;
  }

  if (isBrowser()) {
    try {
      const token = await browserAuthToken();
      if (!token) return loadPlanFirstArtifacts(opts.projectId, opts.workspaceId);
      const res = await fetch(
        `/api/projects/${encodeURIComponent(opts.projectId)}/build-plan`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspaceId: opts.workspaceId,
            projectSpec: opts.projectSpec,
            buildPlan: opts.buildPlan,
            researchManifest: opts.researchManifest,
            implementationManifest: opts.implementationManifest,
          }),
        },
      );
      if (!res.ok) {
        console.warn("[cander] build-plan browser save failed", res.status);
      }
    } catch (err) {
      console.warn("[cander] build-plan browser save error", err);
    }
    return loadPlanFirstArtifacts(opts.projectId, opts.workspaceId);
  }

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("projects")
      .update(patch)
      .eq("id", opts.projectId)
      .eq("workspace_id", opts.workspaceId);
    if (error) {
      console.warn("[cander] plan-first artifacts save failed", error.message);
    }
  } catch (err) {
    console.warn("[cander] plan-first artifacts save error", err);
  }
  // Avoid a full 4-blob reload when the caller already has the patch.
  const current = await loadPlanFirstArtifacts(opts.projectId, opts.workspaceId);
  return {
    projectSpec:
      opts.projectSpec !== undefined ? opts.projectSpec : current.projectSpec,
    buildPlan:
      opts.buildPlan !== undefined ? opts.buildPlan : current.buildPlan,
    researchManifest:
      opts.researchManifest !== undefined
        ? opts.researchManifest
        : current.researchManifest,
    implementationManifest:
      opts.implementationManifest !== undefined
        ? opts.implementationManifest
        : current.implementationManifest,
  };
}
