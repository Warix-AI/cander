/**
 * Plan-first Build smoke (server): fresh site project → persist ProjectSpec/BuildPlan →
 * role-based research scoring → tip gate helpers.
 *
 * Usage (service role + linked DB):
 *   npx tsx --env-file=.env.local scripts/plan-first-smoke.ts
 *
 * Does not patch ryrty. Creates and leaves a smoke project titled with a unique suffix.
 */

import { createClient } from "@supabase/supabase-js";
import { projectSpecFromBriefHeuristic, buildPlanFromSpecHeuristic } from "../lib/ai/build/plan/heuristics.ts";
import { assertNavCoveredBySitemap } from "../lib/ai/build/plan/normalize.ts";
import {
  buildRoleQueries,
  scoreResearchCandidate,
} from "../lib/ai/build/research/score.ts";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const workspaceId =
    process.env.CANDER_SMOKE_WORKSPACE_ID?.trim() ||
    "ws-05bbe28b5c56491ea496f93c2eeea33e";

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suffix = Date.now().toString(36);
  const title = `planfirst-smoke-${suffix}`;

  console.log("[smoke] creating project", { title, workspaceId });
  const projectId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { error: insertErr } = await admin.from("projects").insert({
    id: projectId,
    workspace_id: workspaceId,
    space_id: "build",
    title,
    summary: "Plan-first smoke site",
    kind: "site",
    status: "draft",
    version: 1,
    created_at: now,
    updated_at: now,
    domains: [],
  });
  if (insertErr) throw new Error(insertErr.message);

  // Verify migration columns exist by writing plan artifacts.
  const brief = {
    status: "building" as const,
    completedSteps: 8,
    answers: {
      business_name: "Alpine Arbor Care",
      industry: "tree care / landscaping",
      intent: "Local tree service bookings",
      audience: "homeowners",
      tone: "warm local",
      primary_goal: "Book estimates",
    },
    updatedAt: now,
  };
  const spec = projectSpecFromBriefHeuristic(brief, "Build my site");
  const plan = buildPlanFromSpecHeuristic(spec);
  const navIssues = assertNavCoveredBySitemap(plan.json);
  if (navIssues.length) {
    throw new Error(`nav gaps: ${navIssues.join("; ")}`);
  }

  const researchRoles = plan.json.componentNeeds.map((need) => {
    const queries = buildRoleQueries(need);
    if (queries.some((q) => q.trim().toLowerCase() === "tree")) {
      throw new Error("query collapsed to business noun tree");
    }
    const bad = scoreResearchCandidate({
      need,
      id: "bad-tree",
      name: "Headless Tree",
      deps: ["@headless-tree/core"],
      snippetPreview: "file tree",
    });
    if (!bad.rejectReason) {
      throw new Error("expected headless-tree reject");
    }
    return {
      role: need.role,
      designIntent: need.designIntent,
      queries,
      candidates: [],
      selected: null,
      rejected: [{ id: "bad-tree", reason: bad.rejectReason }],
      fallback: "catalog" as const,
      deps: [],
      primitives: [],
      assets: [],
      config: [],
    };
  });

  const { error: updateErr } = await admin
    .from("projects")
    .update({
      website_setup_brief: brief,
      project_spec: spec,
      build_plan: plan,
      research_manifest: {
        version: 1,
        roles: researchRoles,
        packageDependencies: {},
        updatedAt: now,
      },
      implementation_manifest: {
        version: 1,
        files: [{ path: "package.json" }],
        routes: plan.json.sitemap.map((p) => ({ path: p.path, pageId: p.id })),
        tasks: ["smoke"],
        validation: { ok: false, technical: [], visual: [] },
        updatedAt: now,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("workspace_id", workspaceId);
  if (updateErr) throw new Error(updateErr.message);

  const { data: row, error: readErr } = await admin
    .from("projects")
    .select(
      "id, title, project_spec, build_plan, research_manifest, implementation_manifest",
    )
    .eq("id", projectId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!row?.project_spec || !row?.build_plan || !row?.research_manifest) {
    throw new Error("plan-first columns did not round-trip");
  }

  const roles = (row.research_manifest as { roles?: Array<{ role: string }> })
    .roles;
  const roleNames = (roles ?? []).map((r) => r.role);
  for (const expected of ["hero", "services", "faq"]) {
    if (!roleNames.includes(expected)) {
      throw new Error(`missing role ${expected}`);
    }
  }

  console.log("[smoke] OK", {
    projectId,
    title,
    roles: roleNames,
    sitemap: plan.json.sitemap.map((p) => p.path),
    flagHint: process.env.CANDER_BUILD_PLAN_FIRST || "(unset locally)",
  });
}

main().catch((err) => {
  console.error("[smoke] FAIL", err);
  process.exit(1);
});
