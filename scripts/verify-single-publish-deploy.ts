/**
 * Empirical check: one publish attempt must create exactly one new Vercel
 * production deployment for the project.
 *
 *   npx tsx --env-file=.env.local scripts/verify-single-publish-deploy.ts [projectId]
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
    const t = await res.text();
    throw new Error(`list deployments failed: ${t}`);
  }
  const body = (await res.json()) as {
    deployments?: Array<{ uid?: string; createdAt?: number; meta?: Record<string, string> }>;
  };
  return body.deployments || [];
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const projectIdArg = process.argv[2]?.trim();
  let projectId = projectIdArg;
  let workspaceId =
    process.env.CANDER_SMOKE_WORKSPACE_ID?.trim() ||
    "ws-05bbe28b5c56491ea496f93c2eeea33e";
  let userId =
    process.env.CANDER_SMOKE_USER_ID?.trim() ||
    "05bbe28b-5c56-491e-a496-f93c2eeea33e";

  if (!projectId) {
    // Prefer recent planfirst-e2e with tip + pages
    const { data } = await admin
      .from("projects")
      .select("id, workspace_id, title, draft_sha, vercel_project_id, github_full_name")
      .eq("kind", "site")
      .not("draft_sha", "is", null)
      .order("updated_at", { ascending: false })
      .limit(20);
    const pick =
      (data || []).find((p) => String(p.title || "").includes("planfirst-e2e")) ||
      (data || [])[0];
    if (!pick) throw new Error("No site project with draft_sha found");
    projectId = String(pick.id);
    workspaceId = String(pick.workspace_id);
  }

  const { data: project, error } = await admin
    .from("projects")
    .select(
      "id, workspace_id, title, draft_sha, published_sha, vercel_project_id, github_full_name, github_repo_id",
    )
    .eq("id", projectId)
    .maybeSingle();
  if (error || !project) throw new Error(error?.message || "project missing");
  workspaceId = String(project.workspace_id);

  console.log("[verify] project", {
    id: project.id,
    title: project.title,
    draftSha: String(project.draft_sha || "").slice(0, 12),
    publishedSha: String(project.published_sha || "").slice(0, 12),
    vercelProjectId: project.vercel_project_id,
  });

  // Ensure vercel project + disable auto-deploy before counting.
  const { ensureAppVercelProject } = await import(
    "../lib/build/vercel/projects.ts"
  );
  const ensured = await ensureAppVercelProject({
    projectId: String(project.id),
    workspaceId,
  });
  await disableGitAutoDeployments(ensured.vercelProjectId);

  const before = await listProductionDeployments(ensured.vercelProjectId);
  console.log("[verify] production deployments before", before.length, before.map((d) => d.uid).slice(0, 5));

  // If already published at this tip, bump tip is required — skip by forcing a no-op check.
  if (
    project.published_sha &&
    String(project.published_sha).toLowerCase() ===
      String(project.draft_sha).toLowerCase()
  ) {
    console.log(
      "[verify] tip already published — calling publish anyway (must be idempotent, zero new deploys)",
    );
  }

  const attemptA = crypto.randomUUID();
  const resultA = await publishProject({
    userId,
    projectId: String(project.id),
    workspaceId,
    publishAttemptId: attemptA,
  });
  console.log("[verify] publish A", {
    ok: resultA.ok,
    message: resultA.message,
    deploymentId: resultA.vercelDeploymentId,
    attemptId: resultA.publishAttemptId,
  });

  const mid = await listProductionDeployments(ensured.vercelProjectId);
  console.log("[verify] production deployments after A", mid.length);

  // Double-call same SHA (simulate double-click / retry)
  const attemptB = crypto.randomUUID();
  const resultB = await publishProject({
    userId,
    projectId: String(project.id),
    workspaceId,
    publishAttemptId: attemptB,
  });
  console.log("[verify] publish B (retry same sha)", {
    ok: resultB.ok,
    message: resultB.message,
    deploymentId: resultB.vercelDeploymentId,
    attemptId: resultB.publishAttemptId,
  });

  const after = await listProductionDeployments(ensured.vercelProjectId);
  console.log("[verify] production deployments after B", after.length);

  const created = after.length - before.length;
  const sameDeployment =
    resultA.vercelDeploymentId &&
    resultB.vercelDeploymentId &&
    resultA.vercelDeploymentId === resultB.vercelDeploymentId;

  if (!resultA.ok && !(project.published_sha === project.draft_sha)) {
    // First publish failed for a new tip — report and exit non-zero
    console.error("[verify] FAIL first publish", resultA.message);
    process.exit(1);
  }

  // Fresh publish: exactly one new deploy. Already published: zero new deploys.
  const already =
    String(project.published_sha || "").toLowerCase() ===
    String(project.draft_sha || "").toLowerCase();

  if (already) {
    if (created !== 0) {
      console.error(
        `[verify] FAIL expected 0 new deploys for already-published tip, got ${created}`,
      );
      process.exit(1);
    }
  } else {
    if (created !== 1) {
      console.error(
        `[verify] FAIL expected exactly 1 new production deploy, got ${created}`,
      );
      process.exit(1);
    }
    if (!sameDeployment && resultB.ok) {
      console.error(
        "[verify] FAIL retry returned a different deployment id",
        resultA.vercelDeploymentId,
        resultB.vercelDeploymentId,
      );
      process.exit(1);
    }
  }

  console.log("[verify] PASS", {
    created,
    vercelDeploymentId: resultA.vercelDeploymentId,
    sameDeploymentOnRetry: Boolean(sameDeployment || already),
  });
}

main().catch((err) => {
  console.error("[verify] FAIL", err);
  process.exit(1);
});
