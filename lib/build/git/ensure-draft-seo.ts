/**
 * Ensure draft tip robots ↔ sitemap are consistent (atomic tip commit).
 * Mirrors ensureDraftSitePackageJson. Server-only.
 */

import { getInstallationOctokit } from "@/lib/build/git/github-app";
import { commitFilesToDraftBranch } from "@/lib/build/git/commit-draft";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  canonicalRobotsTs,
  canonicalSitemapTs,
  findRobotsPath,
  findSitemapPath,
  robotsDeclaresSitemap,
  seoConsistencyIssues,
} from "@/lib/ai/build/seo-consistency";

async function readRepoFile(
  octokit: NonNullable<Awaited<ReturnType<typeof getInstallationOctokit>>>,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      { owner, repo, path, ref },
    );
    if (!Array.isArray(data) && data.type === "file" && data.content) {
      return Buffer.from(data.content, "base64").toString("utf8");
    }
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 0;
    if (status !== 404) throw err;
  }
  return null;
}

async function listTipPaths(
  octokit: NonNullable<Awaited<ReturnType<typeof getInstallationOctokit>>>,
  owner: string,
  repo: string,
  treeSha: string,
): Promise<string[]> {
  const { data } = await octokit.request(
    "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
    { owner, repo, tree_sha: treeSha, recursive: "1" },
  );
  return (data.tree || [])
    .filter((t) => t.type === "blob" && t.path)
    .map((t) => String(t.path));
}

function pagePathsFromTip(paths: string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    if (/^app\/page\.(tsx|ts|jsx|js)$/.test(p)) {
      out.add("/");
      continue;
    }
    const m = /^app\/(.+)\/page\.(tsx|ts|jsx|js)$/.exec(p);
    if (m) out.add(`/${m[1]}`);
  }
  return out.size ? [...out] : ["/"];
}

/**
 * Repair robots/sitemap mismatch on the draft tip. Returns updated draft_sha.
 */
export async function ensureDraftSeoArtifacts(opts: {
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
  let tip = project.draft_sha ? String(project.draft_sha) : ref;

  // Resolve tip to a commit sha when only branch name is known.
  if (!/^[0-9a-f]{7,40}$/i.test(tip)) {
    const { data: refData } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/ref/{ref}",
      { owner, repo, ref: `heads/${ref}` },
    );
    tip = String(refData.object.sha);
  }

  const paths = await listTipPaths(octokit, owner, repo, tip);
  const robotsPath = findRobotsPath(paths);
  const sitemapPath = findSitemapPath(paths);
  const robotsContent = robotsPath
    ? await readRepoFile(octokit, owner, repo, robotsPath, tip)
    : null;
  const layoutPath = [
    "app/layout.tsx",
    "app/layout.ts",
    "app/layout.jsx",
    "app/layout.js",
  ].find((p) => paths.includes(p));
  const layoutContent = layoutPath
    ? await readRepoFile(octokit, owner, repo, layoutPath, tip)
    : null;

  const issues = seoConsistencyIssues({
    paths,
    robotsContent,
    layoutContent,
    requireBoth: true,
  });

  // Also catch robots that declare sitemap without file even if presence soft-pass
  if (
    issues.length === 0 &&
    robotsDeclaresSitemap(robotsContent) &&
    !sitemapPath
  ) {
    issues.push(
      "robots declares Sitemap but tip has no sitemap file (add app/sitemap.ts or remove the sitemap declaration).",
    );
  }

  if (issues.length === 0) {
    return { draftSha: tip.toLowerCase(), repaired: false };
  }

  const pages = pagePathsFromTip(paths);
  const files = [
    { path: "app/robots.ts", content: canonicalRobotsTs() },
    { path: "app/sitemap.ts", content: canonicalSitemapTs(pages) },
  ];

  const committed = await commitFilesToDraftBranch({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    files,
    message: "fix(seo): ensure robots and sitemap are consistent",
  });

  console.info("[cander:seo]", {
    projectId: opts.projectId,
    repaired: true,
    draftSha: committed.draftSha.slice(0, 12),
    priorIssues: issues.slice(0, 5),
  });

  return { draftSha: committed.draftSha.toLowerCase(), repaired: true };
}
