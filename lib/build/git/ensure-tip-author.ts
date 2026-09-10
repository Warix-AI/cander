/**
 * Publish repair: re-author the draft tip with the configured Build identity.
 *
 * Drafts committed before CANDER_BUILD_GIT_AUTHOR_* was configured carry the
 * github-actions bot identity, which Vercel rejects for team deploys. Instead
 * of asking the user to make a dummy edit, amend the tip in place: same tree,
 * same message, same parents — only author/committer change. The sandbox pin
 * is moved to the new SHA so the (identical) working tree is not recreated.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getBuildGitAuthor } from "@/lib/build/config";
import { getInstallationOctokit } from "@/lib/build/git/github-app";
import { DRAFT_BRANCH } from "@/lib/build/git/project-git-service";
import {
  normalizeIdentityEmail,
  WEAK_BUILD_GIT_AUTHOR_EMAIL,
} from "@/lib/build/publish/identity-preflight";

export type EnsureTipAuthorResult = {
  draftSha: string;
  repaired: boolean;
  /** Why nothing was done (when repaired=false). */
  skipped?: string;
};

export async function ensureDraftTipAuthor(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<EnsureTipAuthorResult> {
  const expected = getBuildGitAuthor();
  const expectedEmail = normalizeIdentityEmail(expected.email);
  const admin = createSupabaseAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select("github_full_name, draft_branch, draft_sha, sandbox_session_id")
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();
  const draftSha = project?.draft_sha ? String(project.draft_sha).toLowerCase() : "";
  if (error || !project?.github_full_name || !draftSha) {
    return { draftSha, repaired: false, skipped: "no repo or draft tip" };
  }
  // Nothing sensible to re-author to.
  if (!expectedEmail || expectedEmail === WEAK_BUILD_GIT_AUTHOR_EMAIL) {
    return { draftSha, repaired: false, skipped: "build author not configured" };
  }

  const octokit = await getInstallationOctokit();
  if (!octokit) return { draftSha, repaired: false, skipped: "GitHub App not configured" };
  const [owner, repo] = String(project.github_full_name).split("/");
  if (!owner || !repo) return { draftSha, repaired: false, skipped: "bad repo name" };
  const draftBranch = String(project.draft_branch || DRAFT_BRANCH);

  const { data: tip } = await octokit.request(
    "GET /repos/{owner}/{repo}/git/commits/{commit_sha}",
    { owner, repo, commit_sha: draftSha },
  );
  const authorOk = normalizeIdentityEmail(tip.author?.email) === expectedEmail;
  const committerOk = normalizeIdentityEmail(tip.committer?.email) === expectedEmail;
  if (authorOk && committerOk) {
    return { draftSha, repaired: false, skipped: "already correct" };
  }

  // The branch must still point at the SHA we read, or we would clobber a
  // newer commit.
  const { data: ref } = await octokit.request(
    "GET /repos/{owner}/{repo}/git/ref/{ref}",
    { owner, repo, ref: `heads/${draftBranch}` },
  );
  if (String(ref.object.sha).toLowerCase() !== draftSha) {
    return { draftSha, repaired: false, skipped: "draft branch moved" };
  }

  const identity = { name: expected.name, email: expected.email };
  const { data: amended } = await octokit.request(
    "POST /repos/{owner}/{repo}/git/commits",
    {
      owner,
      repo,
      message: tip.message,
      tree: tip.tree.sha,
      parents: tip.parents.map((p) => p.sha),
      author: identity,
      committer: identity,
    },
  );
  await octokit.request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
    owner,
    repo,
    ref: `heads/${draftBranch}`,
    sha: amended.sha,
    force: true, // amend is not a fast-forward
  });

  const newSha = amended.sha.toLowerCase();
  const { syncProjectDraftTipToSha, reconcileDraftTipPointer } = await import(
    "@/lib/build/git/revision-sync"
  );
  let sync = await syncProjectDraftTipToSha({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    draftSha: newSha,
    draftBranch,
  });
  if (!sync.ok) {
    sync = await reconcileDraftTipPointer({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      githubDraftSha: newSha,
      draftBranch,
    });
  }

  // Same tree → the warm sandbox is still valid; move its pin.
  const sessionId = project.sandbox_session_id ? String(project.sandbox_session_id) : "";
  if (sessionId) {
    try {
      const { pinBuildSandboxDraftSha } = await import("@/lib/build/sandbox/lifecycle");
      await pinBuildSandboxDraftSha(sessionId, newSha);
    } catch (err) {
      console.warn("[cander:git] re-author: sandbox pin failed", err instanceof Error ? err.message : err);
    }
  }

  console.info("[cander:git] re-authored draft tip", {
    projectId: opts.projectId,
    from: draftSha.slice(0, 12),
    to: newSha.slice(0, 12),
    author: expected.email,
    dbSyncOk: sync.ok,
  });
  return { draftSha: newSha, repaired: true };
}
