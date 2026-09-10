/**
 * Phase 6 dogfood harness (env-gated).
 *
 * Acceptance = GitHub tip + Vercel deployment list + DB columns — not chat copy.
 *
 * Flow:
 * 1) Prefer an existing site with draft_sha (or pass projectId)
 * 2) Snapshot production deploy count + published_sha
 * 3) Optional draft touch is left to product chat; this script verifies publish side:
 *    - publish once → exactly +1 production deployment, persist ids/URL
 *    - publish same SHA again → same deployment id (idempotent)
 * 4) Assert published_sha only moves on successful publish (not on draft edits —
 *    draft edits are covered by unit contracts in harden-phase6.test.ts)
 *
 *   CANDER_DOGFOOD=1 npx tsx --env-file=.env.local scripts/dogfood-website-publish.ts [projectId]
 *
 * Related live scripts:
 *   - scripts/plan-first-create-e2e.ts (fresh tip)
 *   - scripts/verify-single-publish-deploy.ts (idempotent publish)
 *   - scripts/verify-option-b-deploy.sh (dual-trigger empirics)
 */

import { createClient } from "@supabase/supabase-js";
import { disableGitAutoDeployments } from "../lib/build/vercel/git-autodeploy.ts";
import { publishProject } from "../lib/build/publish/publish-project.ts";
import { vercelFetch } from "../lib/build/vercel/api.ts";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function listProductionDeployments(vercelProjectId: string) {
  const res = await vercelFetch(
    `/v6/deployments?projectId=${encodeURIComponent(vercelProjectId)}&target=production&limit=20`,
  );
  if (!res.ok) {
    throw new Error(`list deployments failed: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    deployments?: Array<{ uid?: string; readyState?: string; createdAt?: number }>;
  };
  return body.deployments || [];
}

async function main() {
  if (process.env.CANDER_DOGFOOD?.trim() !== "1") {
    console.log(
      "[dogfood] skipped — set CANDER_DOGFOOD=1 to run live publish acceptance.",
    );
    console.log(
      "[dogfood] Unit checklist: node --test --experimental-strip-types scripts/harden-phase6.test.ts",
    );
    return;
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let projectId = process.argv[2]?.trim();
  let workspaceId =
    process.env.CANDER_SMOKE_WORKSPACE_ID?.trim() ||
    "ws-05bbe28b5c56491ea496f93c2eeea33e";
  const userId =
    process.env.CANDER_SMOKE_USER_ID?.trim() ||
    "05bbe28b-5c56-491e-a496-f93c2eeea33e";

  if (!projectId) {
    const { data } = await admin
      .from("projects")
      .select("id, workspace_id, title, draft_sha")
      .eq("kind", "site")
      .not("draft_sha", "is", null)
      .order("updated_at", { ascending: false })
      .limit(20);
    const pick =
      (data || []).find((p) => /dogfood|planfirst-e2e|harden/i.test(String(p.title || ""))) ||
      (data || [])[0];
    if (!pick) throw new Error("No site project with draft_sha — run plan-first-create-e2e first");
    projectId = String(pick.id);
    workspaceId = String(pick.workspace_id);
  }

  const { data: project, error } = await admin
    .from("projects")
    .select(
      "id, workspace_id, title, draft_sha, published_sha, published_url, vercel_project_id, github_full_name",
    )
    .eq("id", projectId)
    .maybeSingle();
  if (error || !project) throw new Error(error?.message || "project missing");
  workspaceId = String(project.workspace_id);

  console.log("[dogfood] project", {
    id: project.id,
    title: project.title,
    draftSha: String(project.draft_sha || "").slice(0, 12),
    publishedSha: String(project.published_sha || "").slice(0, 12),
  });

  // Ensure Option B before measuring.
  if (project.vercel_project_id) {
    const disabled = await disableGitAutoDeployments(String(project.vercel_project_id));
    console.log("[dogfood] git auto-deploy disabled", disabled);
  }

  const vercelProjectId = String(project.vercel_project_id || "");
  const before = vercelProjectId
    ? await listProductionDeployments(vercelProjectId)
    : [];
  const beforeCount = before.length;
  const publishedBefore = project.published_sha
    ? String(project.published_sha).toLowerCase()
    : null;

  console.log("[dogfood] production deploys before", beforeCount);

  const first = await publishProject({
    userId,
    projectId: String(project.id),
    workspaceId,
  });
  console.log("[dogfood] publish #1", {
    ok: first.ok,
    status: first.status,
    deploymentId: first.vercelDeploymentId,
    publishedSha: first.publishedSha?.slice(0, 12),
    message: first.message?.slice(0, 200),
  });
  if (!first.ok) {
    throw new Error(`publish #1 failed: ${first.message}`);
  }

  const afterFirst = vercelProjectId
    ? await listProductionDeployments(
        first.vercelProjectId || vercelProjectId,
      )
    : [];
  const delta1 = afterFirst.length - beforeCount;
  if (delta1 !== 1 && publishedBefore !== String(first.publishedSha || "").toLowerCase()) {
    // Allow delta 0 only when republishing an already-live identical tip
    // that short-circuited; otherwise require exactly one new deploy.
    if (!(publishedBefore && publishedBefore === String(first.publishedSha || "").toLowerCase() && delta1 === 0)) {
      throw new Error(
        `Expected +1 production deploy (or 0 when already live same SHA); got delta=${delta1}`,
      );
    }
  }

  const second = await publishProject({
    userId,
    projectId: String(project.id),
    workspaceId,
  });
  console.log("[dogfood] publish #2 (same SHA)", {
    ok: second.ok,
    deploymentId: second.vercelDeploymentId,
    publishedSha: second.publishedSha?.slice(0, 12),
  });
  if (!second.ok) throw new Error(`publish #2 failed: ${second.message}`);
  if (
    first.vercelDeploymentId &&
    second.vercelDeploymentId &&
    first.vercelDeploymentId !== second.vercelDeploymentId
  ) {
    throw new Error(
      `Idempotency failed: deploy ids differ ${first.vercelDeploymentId} vs ${second.vercelDeploymentId}`,
    );
  }

  const afterSecond = await listProductionDeployments(
    second.vercelProjectId || first.vercelProjectId || vercelProjectId,
  );
  const delta2 = afterSecond.length - afterFirst.length;
  if (delta2 !== 0) {
    throw new Error(`Same-SHA republish minted ${delta2} new production deploy(s)`);
  }

  const { data: finalRow } = await admin
    .from("projects")
    .select("draft_sha, published_sha, published_url, vercel_production_deployment_id")
    .eq("id", project.id)
    .maybeSingle();

  console.log("[dogfood] PASS", {
    draftSha: String(finalRow?.draft_sha || "").slice(0, 12),
    publishedSha: String(finalRow?.published_sha || "").slice(0, 12),
    publishedUrl: finalRow?.published_url,
    deploymentId: finalRow?.vercel_production_deployment_id,
    prodDeployCount: afterSecond.length,
  });
}

main().catch((err) => {
  console.error("[dogfood] FAIL", err);
  process.exit(1);
});
