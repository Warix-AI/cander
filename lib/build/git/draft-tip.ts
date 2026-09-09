/**
 * Lightweight draft tip probes (git) — used to gate preview unlock.
 * Server-only.
 */

import { getInstallationOctokit } from "@/lib/build/git/github-app";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * True when the project's draft tip has a package.json with a "next" dependency.
 */
export async function draftTipHasNextPackage(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("github_full_name, draft_branch, draft_sha")
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();

  if (!project?.github_full_name || !project.draft_sha) return false;

  const octokit = await getInstallationOctokit();
  if (!octokit) return false;

  const fullName = String(project.github_full_name);
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) return false;

  const tip = String(project.draft_sha);
  try {
    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner,
        repo,
        path: "package.json",
        ref: tip,
      },
    );
    if (Array.isArray(data) || data.type !== "file" || !data.content) {
      return false;
    }
    const raw = Buffer.from(data.content, "base64").toString("utf8");
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = {
      ...(pkg.devDependencies ?? {}),
      ...(pkg.dependencies ?? {}),
    };
    return Boolean(deps.next);
  } catch {
    return false;
  }
}
