/**
 * Inspect GitHub draft tip (paths + file reads) for edit/create pipelines.
 * Server-only (GitHub App).
 */

import { getInstallationOctokit } from "@/lib/build/git/github-app";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function listTipPaths(opts: {
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

export async function readTipFile(opts: {
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

export type DraftTipInspect = {
  draftSha: string | null;
  draftBranch: string | null;
  githubFullName: string | null;
  paths: string[];
};

/** Load project tip metadata + recursive file paths (capped for prompts). */
export async function inspectProjectDraftTip(opts: {
  projectId: string;
  workspaceId: string;
  /** Max paths returned (default 200). */
  maxPaths?: number;
  /**
   * `app` (default): package.json + app/components/lib/public — sized for prompts.
   * `all`: every blob (needed for gap-fill like boot skeleton so we don't
   * re-commit tsconfig/postcss/.gitignore that already exist at the tip).
   */
  pathsMode?: "app" | "all";
}): Promise<DraftTipInspect> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("projects")
    .select("draft_sha, draft_branch, github_full_name")
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();

  const draftSha = data?.draft_sha ? String(data.draft_sha) : null;
  const draftBranch = data?.draft_branch ? String(data.draft_branch) : null;
  const githubFullName = data?.github_full_name
    ? String(data.github_full_name)
    : null;

  if (!draftSha || !githubFullName) {
    return {
      draftSha,
      draftBranch,
      githubFullName,
      paths: [],
    };
  }

  try {
    const all = await listTipPaths({ fullName: githubFullName, draftSha });
    const max = opts.maxPaths ?? 200;
    if (opts.pathsMode === "all") {
      return { draftSha, draftBranch, githubFullName, paths: all.slice(0, max) };
    }
    const preferred = all.filter(
      (p) =>
        p === "package.json" ||
        p.startsWith("app/") ||
        p.startsWith("components/") ||
        p.startsWith("lib/") ||
        p.startsWith("public/"),
    );
    const paths = (preferred.length ? preferred : all).slice(0, max);
    return { draftSha, draftBranch, githubFullName, paths };
  } catch (err) {
    console.warn("[cander:tip-inspect] list failed", err);
    return { draftSha, draftBranch, githubFullName, paths: [] };
  }
}
