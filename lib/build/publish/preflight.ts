/**
 * Minimal publish tip preflight — exact draft_sha that will be deployed.
 * Full tsc/next build lands in Phase 2; Phase 0 blocks obviously broken tips.
 * Server-only.
 */

import { getInstallationOctokit } from "@/lib/build/git/github-app";
import { packageJsonHasNext } from "@/lib/ai/build/site-package";
import { duplicateAppRouterValidationIssues } from "@/lib/ai/build/routes/app-router-conflicts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PublishPreflightResult = {
  ok: boolean;
  draftSha: string;
  issues: string[];
  paths: string[];
};

async function listTipPaths(opts: {
  fullName: string;
  draftSha: string;
}): Promise<string[]> {
  const octokit = await getInstallationOctokit();
  if (!octokit) throw new Error("GitHub App is not configured.");
  const [owner, repo] = opts.fullName.split("/");
  if (!owner || !repo) throw new Error(`Invalid github_full_name: ${opts.fullName}`);
  const { data } = await octokit.request(
    "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
    {
      owner,
      repo,
      tree_sha: opts.draftSha,
      recursive: "1",
    },
  );
  return (data.tree || [])
    .filter((t) => t.type === "blob" && t.path)
    .map((t) => String(t.path));
}

async function readTipFile(opts: {
  fullName: string;
  draftSha: string;
  path: string;
}): Promise<string | null> {
  const octokit = await getInstallationOctokit();
  if (!octokit) return null;
  const [owner, repo] = opts.fullName.split("/");
  if (!owner || !repo) return null;
  try {
    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner,
        repo,
        path: opts.path,
        ref: opts.draftSha,
      },
    );
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
      return null;
    }
    return Buffer.from(String(data.content), "base64").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Verify the exact SHA Vercel will build has a runnable App Router tip.
 */
export async function preflightPublishTip(opts: {
  projectId: string;
  workspaceId: string;
  draftSha: string;
}): Promise<PublishPreflightResult> {
  const issues: string[] = [];
  const draftSha = opts.draftSha.toLowerCase();
  const admin = createSupabaseAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select("github_full_name, draft_sha")
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();
  if (error || !project?.github_full_name) {
    return {
      ok: false,
      draftSha,
      issues: ["Project has no bound GitHub repository."],
      paths: [],
    };
  }
  const tip = project.draft_sha ? String(project.draft_sha).toLowerCase() : "";
  if (tip && tip !== draftSha) {
    issues.push(
      `draft_sha moved during publish (${tip.slice(0, 7)} ≠ ${draftSha.slice(0, 7)}). Retry Publish.`,
    );
  }

  const fullName = String(project.github_full_name);
  let paths: string[] = [];
  try {
    paths = await listTipPaths({ fullName, draftSha });
  } catch (err) {
    return {
      ok: false,
      draftSha,
      issues: [
        err instanceof Error
          ? err.message
          : "Could not read draft tip tree for preflight.",
      ],
      paths: [],
    };
  }

  if (!paths.includes("package.json")) {
    issues.push("package.json missing on draft tip.");
  } else {
    const pkg = await readTipFile({
      fullName,
      draftSha,
      path: "package.json",
    });
    if (!pkg || !packageJsonHasNext(pkg)) {
      issues.push('package.json must list "next", "react", and "react-dom".');
    }
  }

  const hasPage =
    paths.includes("app/page.tsx") ||
    paths.includes("app/page.ts") ||
    paths.includes("app/page.jsx") ||
    paths.includes("app/page.js");
  const hasLayout =
    paths.includes("app/layout.tsx") ||
    paths.includes("app/layout.ts") ||
    paths.includes("app/layout.jsx") ||
    paths.includes("app/layout.js");
  if (!hasPage) issues.push("Missing App Router page (app/page.tsx).");
  if (!hasLayout) issues.push("Missing App Router layout (app/layout.tsx).");

  issues.push(...duplicateAppRouterValidationIssues(paths));

  return {
    ok: issues.length === 0,
    draftSha,
    issues,
    paths,
  };
}
