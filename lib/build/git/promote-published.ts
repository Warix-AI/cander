/**
 * Promote draft tip onto the project's default branch (usually main).
 * Server-only. Callers must assertProjectAccess.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getInstallationOctokit } from "@/lib/build/git/github-app";
import { isGitSha } from "@/lib/build/git/revision-pointers";

export type PromotePublishedResult = {
  publishedSha: string;
  defaultBranch: string;
  draftBranch: string;
  fullName: string;
  alreadyAtTip: boolean;
};

/**
 * Force-update default branch (main) to the given SHA (typically draft tip).
 * Does not write projects.published_sha — caller does that after deploy succeeds.
 */
export async function promoteDraftShaToDefaultBranch(opts: {
  projectId: string;
  workspaceId: string;
  sha?: string;
}): Promise<PromotePublishedResult> {
  const octokit = await getInstallationOctokit();
  if (!octokit) {
    throw new Error("GitHub App is not configured.");
  }

  const admin = createSupabaseAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select(
      "github_full_name, github_default_branch, draft_branch, draft_sha, published_sha",
    )
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

  const defaultBranch = String(project.github_default_branch || "main");
  const draftBranch = String(project.draft_branch || "cander/draft");
  const target = (opts.sha || project.draft_sha || "").trim().toLowerCase();
  if (!isGitSha(target)) {
    throw new Error("No draft commit to publish. Save a draft first.");
  }

  // Confirm SHA exists
  await octokit.request("GET /repos/{owner}/{repo}/git/commits/{commit_sha}", {
    owner,
    repo,
    commit_sha: target,
  });

  let currentMain = "";
  try {
    const { data: ref } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/ref/{ref}",
      { owner, repo, ref: `heads/${defaultBranch}` },
    );
    currentMain = String(ref.object.sha).toLowerCase();
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 0;
    if (status !== 404) throw err;
  }

  if (currentMain === target) {
    return {
      publishedSha: target,
      defaultBranch,
      draftBranch,
      fullName,
      alreadyAtTip: true,
    };
  }

  if (currentMain) {
    await octokit.request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
      owner,
      repo,
      ref: `heads/${defaultBranch}`,
      sha: target,
      force: true,
    });
  } else {
    await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
      owner,
      repo,
      ref: `refs/heads/${defaultBranch}`,
      sha: target,
    });
  }

  return {
    publishedSha: target,
    defaultBranch,
    draftBranch,
    fullName,
    alreadyAtTip: false,
  };
}
