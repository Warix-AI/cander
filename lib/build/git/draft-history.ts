/**
 * List / restore draft-branch commits (git SHAs as revisions).
 * Server-only. Callers must assertProjectAccess.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getInstallationOctokit } from "@/lib/build/git/github-app";
import { DRAFT_BRANCH } from "@/lib/build/git/project-git-service";
import { isGitSha, shortSha } from "@/lib/build/git/revision-pointers";
import { syncProjectDraftTipToSha } from "@/lib/build/git/revision-sync";

export type DraftCommit = {
  sha: string;
  shortSha: string;
  message: string;
  title: string;
  authorName: string | null;
  authorDate: string | null;
  parents: string[];
};

async function loadProjectRepo(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<{
  fullName: string;
  owner: string;
  repo: string;
  draftBranch: string;
  draftSha: string | null;
}> {
  const admin = createSupabaseAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select("github_full_name, draft_branch, draft_sha")
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
  return {
    fullName,
    owner,
    repo,
    draftBranch: String(project.draft_branch || DRAFT_BRANCH),
    draftSha: project.draft_sha ? String(project.draft_sha) : null,
  };
}

function mapCommit(raw: {
  sha: string;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string } | null;
  };
  parents?: Array<{ sha: string }>;
}): DraftCommit {
  const message = (raw.commit?.message || "").trim() || "(no message)";
  const title = message.split("\n")[0]?.slice(0, 120) || "(no message)";
  return {
    sha: raw.sha,
    shortSha: shortSha(raw.sha),
    message,
    title,
    authorName: raw.commit?.author?.name ?? null,
    authorDate: raw.commit?.author?.date ?? null,
    parents: (raw.parents ?? []).map((p) => p.sha),
  };
}

/**
 * List commits on cander/draft (newest first). Reconciles projects.draft_sha to remote tip.
 */
export async function listDraftCommits(opts: {
  projectId: string;
  workspaceId: string;
  limit?: number;
}): Promise<{
  commits: DraftCommit[];
  draftBranch: string;
  tipSha: string | null;
  reconciled: boolean;
}> {
  const octokit = await getInstallationOctokit();
  if (!octokit) {
    throw new Error("GitHub App is not configured.");
  }
  const repoMeta = await loadProjectRepo(opts);
  const perPage = Math.min(Math.max(opts.limit ?? 40, 1), 100);

  const { data } = await octokit.request("GET /repos/{owner}/{repo}/commits", {
    owner: repoMeta.owner,
    repo: repoMeta.repo,
    sha: repoMeta.draftBranch,
    per_page: perPage,
  });

  const commits = (Array.isArray(data) ? data : []).map((c) =>
    mapCommit(c as Parameters<typeof mapCommit>[0]),
  );
  const tipSha = commits[0]?.sha ?? null;
  let reconciled = false;

  if (tipSha && tipSha.toLowerCase() !== (repoMeta.draftSha || "").toLowerCase()) {
    await syncProjectDraftTipToSha({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      draftSha: tipSha,
      draftBranch: repoMeta.draftBranch,
    });
    reconciled = true;
  }

  return {
    commits,
    draftBranch: repoMeta.draftBranch,
    tipSha,
    reconciled,
  };
}

/**
 * Move cander/draft tip to an earlier commit SHA (force update ref).
 * Does not recreate sandbox — caller should forceRestart ensure.
 */
export async function restoreDraftToSha(opts: {
  projectId: string;
  workspaceId: string;
  sha: string;
}): Promise<{
  draftSha: string;
  draftBranch: string;
  fullName: string;
  alreadyAtTip: boolean;
}> {
  const target = opts.sha.trim().toLowerCase();
  if (!isGitSha(target)) {
    throw new Error("Invalid commit SHA.");
  }

  const octokit = await getInstallationOctokit();
  if (!octokit) {
    throw new Error("GitHub App is not configured.");
  }
  const repoMeta = await loadProjectRepo(opts);

  // Ensure SHA exists
  await octokit.request("GET /repos/{owner}/{repo}/git/commits/{commit_sha}", {
    owner: repoMeta.owner,
    repo: repoMeta.repo,
    commit_sha: target,
  });

  // Must appear on draft-branch history (first 100)
  const { data: history } = await octokit.request(
    "GET /repos/{owner}/{repo}/commits",
    {
      owner: repoMeta.owner,
      repo: repoMeta.repo,
      sha: repoMeta.draftBranch,
      per_page: 100,
    },
  );
  const allowed = new Set(
    (Array.isArray(history) ? history : []).map((c) =>
      String((c as { sha: string }).sha).toLowerCase(),
    ),
  );
  if (!allowed.has(target)) {
    throw new Error(
      "That commit is not on this project's draft history. Pick a revision from Changes.",
    );
  }

  const { data: ref } = await octokit.request(
    "GET /repos/{owner}/{repo}/git/ref/{ref}",
    {
      owner: repoMeta.owner,
      repo: repoMeta.repo,
      ref: `heads/${repoMeta.draftBranch}`,
    },
  );
  const currentTip = String(ref.object.sha).toLowerCase();
  if (currentTip === target) {
    await syncProjectDraftTipToSha({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      draftSha: target,
      draftBranch: repoMeta.draftBranch,
    });
    return {
      draftSha: target,
      draftBranch: repoMeta.draftBranch,
      fullName: repoMeta.fullName,
      alreadyAtTip: true,
    };
  }

  await octokit.request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
    owner: repoMeta.owner,
    repo: repoMeta.repo,
    ref: `heads/${repoMeta.draftBranch}`,
    sha: target,
    force: true,
  });

  await syncProjectDraftTipToSha({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    draftSha: target,
    draftBranch: repoMeta.draftBranch,
  });

  return {
    draftSha: target,
    draftBranch: repoMeta.draftBranch,
    fullName: repoMeta.fullName,
    alreadyAtTip: false,
  };
}
