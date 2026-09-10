/**
 * Commit file contents to the project's cander/draft branch via GitHub Git Data API.
 * Server-only. No git CLI. Callers must assertProjectAccess.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getBuildGitAuthor } from "@/lib/build/config";
import { getInstallationOctokit } from "@/lib/build/git/github-app";
import { DRAFT_BRANCH } from "@/lib/build/git/project-git-service";
import { safeRepoRelativePath } from "@/lib/build/git/path-safe";

export type DraftFileChange = {
  /** Repo-relative path, e.g. `app/page.tsx` */
  path: string;
  content: string;
  /** Default utf-8 text; use base64 for binaries later */
  encoding?: "utf-8" | "base64";
};

export type CommitDraftResult = {
  draftSha: string;
  draftBranch: string;
  fullName: string;
  filesCommitted: number;
  noop: boolean;
  /** False when GitHub advanced but projects.draft_sha / revision pointer sync failed. */
  dbSyncOk?: boolean;
  dbSyncError?: string;
};

export { safeRepoRelativePath };

/**
 * Create a commit on draft_branch with the given file contents (full-file updates).
 */
export async function commitFilesToDraftBranch(opts: {
  projectId: string;
  workspaceId: string;
  message: string;
  files: DraftFileChange[];
  /**
   * Repo-relative paths to remove in the same commit (GitHub tree `sha: null`).
   * Use when replacing `app/page.js` with `app/page.tsx` so Next never sees both.
   */
  deletePaths?: string[];
}): Promise<CommitDraftResult> {
  const octokit = await getInstallationOctokit();
  if (!octokit) {
    throw new Error("GitHub App is not configured.");
  }

  const admin = createSupabaseAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select(
      "id, github_full_name, github_default_branch, draft_branch, draft_sha",
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

  const draftBranch = String(project.draft_branch || DRAFT_BRANCH);
  const files = opts.files.map((f) => ({
    path: safeRepoRelativePath(f.path),
    content: f.content,
    encoding: f.encoding ?? ("utf-8" as const),
  }));
  const deletePaths = [
    ...new Set(
      (opts.deletePaths ?? []).map((p) => safeRepoRelativePath(p)),
    ),
  ].filter((p) => !files.some((f) => f.path === p));

  if (files.length === 0 && deletePaths.length === 0) {
    const sha = project.draft_sha ? String(project.draft_sha) : "";
    return {
      draftSha: sha,
      draftBranch,
      fullName,
      filesCommitted: 0,
      noop: true,
    };
  }

  // Resolve draft tip (create branch from default if missing).
  let baseCommitSha: string;
  let baseTreeSha: string;
  try {
    const { data: ref } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/ref/{ref}",
      { owner, repo, ref: `heads/${draftBranch}` },
    );
    baseCommitSha = ref.object.sha;
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 0;
    if (status !== 404) throw err;
    const defaultBranch = String(project.github_default_branch || "main");
    const { data: ref } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/ref/{ref}",
      { owner, repo, ref: `heads/${defaultBranch}` },
    );
    baseCommitSha = ref.object.sha;
    await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
      owner,
      repo,
      ref: `refs/heads/${draftBranch}`,
      sha: baseCommitSha,
    });
  }

  const { data: baseCommit } = await octokit.request(
    "GET /repos/{owner}/{repo}/git/commits/{commit_sha}",
    { owner, repo, commit_sha: baseCommitSha },
  );
  baseTreeSha = baseCommit.tree.sha;

  // Only delete paths that exist on the tip. GitHub create-tree with sha:null
  // on a missing path returns 422 GitRPC::BadObjectState (not a noop).
  let existingTipPaths = new Set<string>();
  try {
    const { data: tipTree } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
      {
        owner,
        repo,
        tree_sha: baseTreeSha,
        recursive: "true",
      },
    );
    for (const node of tipTree.tree || []) {
      if (node.type === "blob" && typeof node.path === "string") {
        existingTipPaths.add(node.path);
      }
    }
  } catch (err) {
    console.warn("[cander:git] tip tree list failed; skipping deletes", err);
    existingTipPaths = new Set();
  }

  const { filterDeletesToExistingPaths } = await import(
    "@/lib/ai/build/routes/app-router-conflicts"
  );
  const safeDeletes = filterDeletesToExistingPaths(
    deletePaths,
    existingTipPaths,
  );

  const treeItems: Array<{
    path: string;
    mode: "100644";
    type: "blob";
    sha: string | null;
  }> = [];

  for (const file of files) {
    const { data: blob } = await octokit.request(
      "POST /repos/{owner}/{repo}/git/blobs",
      {
        owner,
        repo,
        content: file.content,
        encoding: file.encoding === "base64" ? "base64" : "utf-8",
      },
    );
    treeItems.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  // GitHub Git Data API: sha null deletes the path from the new tree.
  for (const path of safeDeletes) {
    treeItems.push({
      path,
      mode: "100644",
      type: "blob",
      sha: null,
    });
  }

  const { data: newTree } = await octokit.request(
    "POST /repos/{owner}/{repo}/git/trees",
    {
      owner,
      repo,
      base_tree: baseTreeSha,
      tree: treeItems,
    },
  );

  const buildAuthor = getBuildGitAuthor();
  // Phase 5: only Warix Build identity — no per-call author overrides.
  const author = {
    name: buildAuthor.name,
    email: buildAuthor.email,
  };
  const { data: newCommit } = await octokit.request(
    "POST /repos/{owner}/{repo}/git/commits",
    {
      owner,
      repo,
      message: opts.message.slice(0, 500),
      tree: newTree.sha,
      parents: [baseCommitSha],
      author,
      committer: author,
    },
  );

  await octokit.request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
    owner,
    repo,
    ref: `heads/${draftBranch}`,
    sha: newCommit.sha,
    force: false,
  });

  const draftSha = newCommit.sha;
  const { syncProjectDraftTipToSha, reconcileDraftTipPointer } = await import(
    "@/lib/build/git/revision-sync"
  );
  let sync = await syncProjectDraftTipToSha({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    draftSha,
    draftBranch,
  });
  if (!sync.ok) {
    sync = await reconcileDraftTipPointer({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      githubDraftSha: draftSha,
      draftBranch,
    });
  }

  return {
    draftSha,
    draftBranch,
    fullName,
    filesCommitted: files.length + safeDeletes.length,
    noop: false,
    dbSyncOk: sync.ok,
    dbSyncError: sync.ok ? undefined : sync.error,
  };
}
