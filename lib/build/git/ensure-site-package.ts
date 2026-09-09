/**
 * Ensure the draft tip has a Vercel-detectable Next.js package.json plus
 * shadcn/21st support files (`lib/utils`, UI stubs, common deps).
 * Server-only.
 */

import { getInstallationOctokit } from "@/lib/build/git/github-app";
import { commitFilesToDraftBranch } from "@/lib/build/git/commit-draft";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ensureNextInPackageJson,
  packageJsonHasNext,
} from "@/lib/ai/build/site-package";
import {
  SITE_COMMON_DEPENDENCIES,
  sanitizeTwentyFirstVendorSource,
  siteSupportScaffoldFiles,
} from "@/lib/ai/build/site-support-files";

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

function packageMissingCommonDeps(raw: string | null): boolean {
  if (!raw?.trim()) return true;
  try {
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
    };
    const deps = pkg.dependencies ?? {};
    return Object.keys(SITE_COMMON_DEPENDENCIES).some((key) => !deps[key]);
  } catch {
    return true;
  }
}

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

  const rawPkg = await readRepoFile(octokit, owner, repo, "package.json", tip);
  const utils = await readRepoFile(octokit, owner, repo, "lib/utils.ts", tip);
  const tsconfig = await readRepoFile(
    octokit,
    owner,
    repo,
    "tsconfig.json",
    tip,
  );

  const needsPkg =
    !packageJsonHasNext(rawPkg) || packageMissingCommonDeps(rawPkg);
  const needsSupport = !utils?.trim() || !tsconfig?.trim();

  // Sanitize vendor files that import the `ai` SDK (common 21st FAQ paste).
  const vendorRepairs: { path: string; content: string }[] = [];
  try {
    const { data: tree } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
      {
        owner,
        repo,
        tree_sha: tip,
        recursive: "true",
      },
    );
    const vendorPaths = (tree.tree || [])
      .filter(
        (n) =>
          n.type === "blob" &&
          typeof n.path === "string" &&
          n.path.startsWith("components/twenty-first/") &&
          /\.(tsx|ts|jsx|js)$/.test(n.path),
      )
      .map((n) => String(n.path));
    for (const path of vendorPaths.slice(0, 40)) {
      const raw = await readRepoFile(octokit, owner, repo, path, tip);
      if (!raw) continue;
      const next = sanitizeTwentyFirstVendorSource(raw);
      if (next !== raw) {
        vendorRepairs.push({ path, content: next });
      }
    }
  } catch (err) {
    console.warn("[cander] vendor sanitize skipped", err);
  }

  if (!needsPkg && !needsSupport && vendorRepairs.length === 0) {
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

  const files: { path: string; content: string }[] = [];
  if (needsPkg) {
    files.push({
      path: "package.json",
      content: ensureNextInPackageJson(rawPkg, { name: slug }),
    });
  }
  if (needsSupport) {
    for (const f of siteSupportScaffoldFiles()) {
      // Don't overwrite existing utils/tsconfig if only one is missing.
      if (f.path === "lib/utils.ts" && utils?.trim()) continue;
      if (f.path === "tsconfig.json" && tsconfig?.trim()) continue;
      const existing = await readRepoFile(octokit, owner, repo, f.path, tip);
      if (existing?.trim() && f.path.startsWith("components/ui/")) continue;
      files.push(f);
    }
  }
  files.push(...vendorRepairs);

  if (files.length === 0) {
    return {
      draftSha: project.draft_sha ? String(project.draft_sha) : "",
      repaired: false,
    };
  }

  const committed = await commitFilesToDraftBranch({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    message: "Cander: ensure Next.js package and UI support files for publish",
    files,
  });

  return { draftSha: committed.draftSha, repaired: true };
}
