/**
 * Ensure the draft tip has a Vercel-detectable Next.js package.json.
 * Server-only.
 */

import { getInstallationOctokit } from "@/lib/build/git/github-app";
import { commitFilesToDraftBranch } from "@/lib/build/git/commit-draft";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ensureNextInPackageJson,
  packageJsonHasNext,
} from "@/lib/ai/build/site-package";

export async function ensureDraftSitePackageJson(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<{ draftSha: string; repaired: boolean }> {
  const octokit = await getInstallationOctokit();
  if (!octokit) {
    throw new Error("GitHub App is not configured.");
  }

  const admin = createSupabaseAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select("github_full_name, draft_branch, draft_sha, title")
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();
  if (error || !project?.github_full_name) {
    throw new Error("Project has no bound GitHub repository.");
  }

  const fullName = String(project.github_full_name);
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid github_full_name: ${fullName}`);
  }

  const ref = String(project.draft_branch || "cander/draft");
  const tip = project.draft_sha ? String(project.draft_sha) : ref;

  let raw: string | null = null;
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
    if (!Array.isArray(data) && data.type === "file" && data.content) {
      raw = Buffer.from(data.content, "base64").toString("utf8");
    }
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 0;
    if (status !== 404) throw err;
    raw = null;
  }

  if (packageJsonHasNext(raw)) {
    return {
      draftSha: project.draft_sha ? String(project.draft_sha) : "",
      repaired: false,
    };
  }

  const slug =
    String(project.title || "cander-site")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "cander-site";

  const nextPkg = ensureNextInPackageJson(raw, { name: slug });
  const committed = await commitFilesToDraftBranch({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    message: "Cander: ensure Next.js package.json for Vercel publish",
    files: [{ path: "package.json", content: nextPkg }],
  });

  return { draftSha: committed.draftSha, repaired: true };
}
