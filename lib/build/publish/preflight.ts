/**
 * Publish tip preflight against the exact draft_sha that will be deployed.
 * Static tree/deps checks, then SHA-pinned sandbox tsc + next build.
 * Failures block Deploy API and main promotion. Server-only.
 */

import { getInstallationOctokit } from "@/lib/build/git/github-app";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureProjectSandbox } from "@/lib/build/sandbox/lifecycle";
import { runPrivilegedSandboxCommand } from "@/lib/build/sandbox/privileged";
import { BUILD_RETRY_BUDGETS } from "@/lib/ai/build/retry-budgets";
import {
  collectMissingAliasPaths,
  collectMissingPackageDeps,
  isPreflightSourcePath,
  seoTipIssues,
  staticTipStructureIssues,
} from "@/lib/build/publish/preflight-checks";
import {
  buildIdentityConfigIssues,
  tipCommitIdentityIssues,
} from "@/lib/build/publish/identity-preflight";
import {
  getBuildGitAuthor,
  getGitHubAppConfig,
  getVercelTeamConfig,
  isGitHubAppConfigured,
} from "@/lib/build/config";

export type PublishPreflightResult = {
  ok: boolean;
  draftSha: string;
  issues: string[];
  paths: string[];
  /** True when sandbox tsc + next build ran successfully. */
  compileOk?: boolean;
};

export {
  collectMissingAliasPaths,
  collectMissingPackageDeps,
  seoTipIssues,
  staticTipStructureIssues,
} from "@/lib/build/publish/preflight-checks";

const INSTALL_TIMEOUT_SEC = 90;
const TSC_TIMEOUT_SEC = 60;
const NEXT_BUILD_TIMEOUT_SEC = 180;

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

function trimCmdOutput(text: string, max = 1200): string {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  return `…${t.slice(-max)}`;
}

async function runCompilePreflight(opts: {
  userId: string;
  projectId: string;
  workspaceId: string;
  draftSha: string;
}): Promise<string[]> {
  const issues: string[] = [];
  // Prefer forceRestart so the sandbox clones the current draft tip (includes
  // recent SEO repair commits) before we pin the exact publish SHA.
  const sandbox = await ensureProjectSandbox({
    userId: opts.userId,
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    forceRestart: true,
  });
  if (!sandbox.sessionId || sandbox.status === "unavailable") {
    return [
      sandbox.message ||
        "Could not ensure build sandbox for publish compile preflight.",
    ];
  }
  const sessionId = sandbox.sessionId;
  const userId = opts.userId;
  const sha = opts.draftSha;

  // One compile attempt per publish (budget documentation).
  void BUILD_RETRY_BUDGETS.publishPreflightCompile;

  const pin = await runPrivilegedSandboxCommand({
    sessionId,
    userId,
    cmd: "sh",
    args: [
      "-c",
      [
        "set -e",
        `SHA=${JSON.stringify(sha)}`,
        'if ! git cat-file -e "${SHA}^{commit}" 2>/dev/null; then',
        '  git fetch --depth=1 origin "$SHA" 2>/dev/null || true',
        '  git fetch origin "$SHA" 2>/dev/null || true',
        '  git fetch --depth=30 origin cander/draft 2>/dev/null || true',
        '  git fetch --depth=30 origin main 2>/dev/null || true',
        "fi",
        'if ! git cat-file -e "${SHA}^{commit}" 2>/dev/null; then',
        "  git fetch --unshallow 2>/dev/null || true",
        '  git fetch origin "$SHA" 2>/dev/null || true',
        "fi",
        'git reset --hard "$SHA"',
        "git rev-parse HEAD",
      ].join("\n"),
    ],
  });
  if (pin.exitCode !== 0) {
    return [
      `Could not pin sandbox to draft SHA ${sha.slice(0, 7)}: ${trimCmdOutput(pin.stderr || pin.stdout)}`,
    ];
  }
  const head = (pin.stdout || "").trim().split(/\s+/).pop()?.toLowerCase() || "";
  if (head && head !== sha) {
    issues.push(
      `Sandbox HEAD ${head.slice(0, 7)} ≠ publish SHA ${sha.slice(0, 7)} after reset.`,
    );
    return issues;
  }

  const install = await runPrivilegedSandboxCommand({
    sessionId,
    userId,
    cmd: "sh",
    args: [
      "-c",
      `timeout ${INSTALL_TIMEOUT_SEC} npm install --no-fund --no-audit > /tmp/cander-preflight-npm.log 2>&1; echo EXIT:$?; tail -n 40 /tmp/cander-preflight-npm.log`,
    ],
  });
  const installExit = /EXIT:(\d+)/.exec(install.stdout || "")?.[1];
  if (installExit && installExit !== "0") {
    return [
      `npm install failed during publish preflight (exit ${installExit}): ${trimCmdOutput(install.stdout || install.stderr)}`,
    ];
  }

  const tsc = await runPrivilegedSandboxCommand({
    sessionId,
    userId,
    cmd: "sh",
    args: [
      "-c",
      `if [ -f tsconfig.json ]; then timeout ${TSC_TIMEOUT_SEC} npx --yes tsc --noEmit > /tmp/cander-preflight-tsc.log 2>&1; echo EXIT:$?; tail -n 60 /tmp/cander-preflight-tsc.log; else echo EXIT:0; echo 'no tsconfig — skip tsc'; fi`,
    ],
  });
  const tscExit = /EXIT:(\d+)/.exec(tsc.stdout || "")?.[1];
  if (tscExit && tscExit !== "0") {
    return [
      `Typecheck failed (tsc --noEmit, exit ${tscExit}): ${trimCmdOutput(tsc.stdout || tsc.stderr)}`,
    ];
  }

  const build = await runPrivilegedSandboxCommand({
    sessionId,
    userId,
    cmd: "sh",
    args: [
      "-c",
      `timeout ${NEXT_BUILD_TIMEOUT_SEC} npm run build > /tmp/cander-preflight-build.log 2>&1; echo EXIT:$?; tail -n 80 /tmp/cander-preflight-build.log`,
    ],
  });
  const buildExit = /EXIT:(\d+)/.exec(build.stdout || "")?.[1];
  if (buildExit && buildExit !== "0") {
    return [
      `next build failed during publish preflight (exit ${buildExit}): ${trimCmdOutput(build.stdout || build.stderr)}`,
    ];
  }

  return issues;
}

/**
 * Verify the exact SHA Vercel will build is structurally sound and compiles.
 */
export async function preflightPublishTip(opts: {
  projectId: string;
  workspaceId: string;
  draftSha: string;
  /** Required for compile preflight (sandbox). */
  userId?: string;
  /** Skip sandbox tsc/next build (tests / emergency). */
  skipCompile?: boolean;
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

  // Phase 5 — Warix identity: App + team token + tip commit author.
  {
    const gh = getGitHubAppConfig();
    const vercel = getVercelTeamConfig();
    issues.push(
      ...buildIdentityConfigIssues({
        githubAppConfigured: isGitHubAppConfigured(),
        githubOrg: gh?.org ?? null,
        vercelTokenConfigured: Boolean(vercel.token),
        vercelTeamIdConfigured: Boolean(vercel.teamId),
      }),
    );

    try {
      const octokit = await getInstallationOctokit();
      if (octokit) {
        const [owner, repo] = fullName.split("/");
        if (owner && repo) {
          const { data: tipCommit } = await octokit.request(
            "GET /repos/{owner}/{repo}/git/commits/{commit_sha}",
            { owner, repo, commit_sha: draftSha },
          );
          issues.push(
            ...tipCommitIdentityIssues(
              {
                authorName: tipCommit.author?.name ?? null,
                authorEmail: tipCommit.author?.email ?? null,
                committerName: tipCommit.committer?.name ?? null,
                committerEmail: tipCommit.committer?.email ?? null,
              },
              getBuildGitAuthor(),
            ),
          );
        }
      }
    } catch (err) {
      issues.push(
        err instanceof Error
          ? `Could not verify draft tip commit author: ${err.message}`
          : "Could not verify draft tip commit author.",
      );
    }
  }

  let paths: string[] = [];
  try {
    paths = await listTipPaths({ fullName, draftSha });
  } catch (err) {
    return {
      ok: false,
      draftSha,
      issues: [
        ...issues,
        err instanceof Error
          ? err.message
          : "Could not read draft tip tree for preflight.",
      ],
      paths: [],
    };
  }

  const pkgRaw = paths.includes("package.json")
    ? await readTipFile({ fullName, draftSha, path: "package.json" })
    : null;
  issues.push(...staticTipStructureIssues(paths, pkgRaw));

  const sourcePaths = paths
    .filter((p) => isPreflightSourcePath(p))
    .filter(
      (p) =>
        p.startsWith("app/") ||
        p.startsWith("components/") ||
        p.startsWith("lib/") ||
        p.startsWith("src/"),
    )
    .slice(0, 40);

  const sources: Array<{ path: string; content: string }> = [];
  for (const path of sourcePaths) {
    const content = await readTipFile({ fullName, draftSha, path });
    if (content) sources.push({ path, content });
  }

  if (pkgRaw) {
    issues.push(...collectMissingPackageDeps(sources, pkgRaw));
  }
  issues.push(...collectMissingAliasPaths(sources, paths));

  const layoutPath = [
    "app/layout.tsx",
    "app/layout.ts",
    "app/layout.jsx",
    "app/layout.js",
  ].find((p) => paths.includes(p));
  const layoutContent = layoutPath
    ? await readTipFile({ fullName, draftSha, path: layoutPath })
    : null;
  const robotsPath = ["app/robots.ts", "app/robots.js", "robots.txt"].find(
    (p) => paths.includes(p),
  );
  const robotsContent = robotsPath
    ? await readTipFile({ fullName, draftSha, path: robotsPath })
    : null;
  issues.push(...seoTipIssues(paths, layoutContent, robotsContent));

  if (issues.length > 0) {
    return { ok: false, draftSha, issues, paths, compileOk: false };
  }

  let compileOk = false;
  if (!opts.skipCompile) {
    if (!opts.userId) {
      return {
        ok: false,
        draftSha,
        issues: ["Publish compile preflight requires userId."],
        paths,
        compileOk: false,
      };
    }
    const compileIssues = await runCompilePreflight({
      userId: opts.userId,
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      draftSha,
    });
    if (compileIssues.length > 0) {
      return {
        ok: false,
        draftSha,
        issues: compileIssues,
        paths,
        compileOk: false,
      };
    }
    compileOk = true;
  }

  return {
    ok: true,
    draftSha,
    issues: [],
    paths,
    compileOk,
  };
}
