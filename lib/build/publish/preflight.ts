/**
 * Publish tip preflight against the exact draft_sha that will be deployed.
 * Static tree/deps checks, then SHA-pinned sandbox tsc + next build.
 * Failures block Deploy API and main promotion. Server-only.
 */

import { getInstallationOctokit } from "@/lib/build/git/github-app";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureProjectSandbox } from "@/lib/build/sandbox/lifecycle";
import { runPrivilegedSandboxCommand } from "@/lib/build/sandbox/privileged";
import { refreshSandboxGitAuth } from "@/lib/build/sandbox/git-auth";
import { getGitHubInstallationToken } from "@/lib/build/git/installation-token";
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

/**
 * The builder already ran tsc + route checks inside the sandbox for this exact
 * tip when the last job finished cleanly. Publishing the same SHA need not
 * compile it again.
 */
async function jobVerificationForSha(opts: {
  projectId: string;
  workspaceId: string;
  draftSha: string;
}): Promise<{ typecheck: boolean; build: boolean }> {
  try {
    const { findLatestBuildJob } = await import("@/lib/build/jobs/store");
    const job = await findLatestBuildJob({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
    });
    const sha = opts.draftSha.toLowerCase();
    const typecheck = Boolean(
      job &&
        job.status === "ready_for_review" &&
        job.facts.verifyOk === true &&
        job.facts.draftSha &&
        job.facts.draftSha.toLowerCase() === sha,
    );
    const build = Boolean(typecheck && job?.facts.buildVerified?.sha?.toLowerCase() === sha);
    return { typecheck, build };
  } catch {
    return { typecheck: false, build: false };
  }
}

/**
 * Production build is the only check that matches what Vercel runs; it is on
 * by default and only skipped when the builder already ran it on this SHA.
 * `CANDER_PUBLISH_PREFLIGHT_BUILD=0` disables it (emergency / tests).
 */
function productionBuildEnabled(): boolean {
  return process.env.CANDER_PUBLISH_PREFLIGHT_BUILD?.trim() !== "0";
}

async function runCompilePreflight(opts: {
  userId: string;
  projectId: string;
  workspaceId: string;
  draftSha: string;
  fullName: string;
  /** Skip tsc because the builder already typechecked this exact SHA. */
  skipTypecheck?: boolean;
}): Promise<string[]> {
  const issues: string[] = [];
  // Reuse the warm draft sandbox. Restarting it here used to kill the user's
  // preview (HTTP 410 after every publish) and re-run a full clone + npm
  // install, which was most of the "republish takes forever" time.
  const sandbox = await ensureProjectSandbox({
    userId: opts.userId,
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
  });
  if (!sandbox.sessionId || sandbox.status === "unavailable" || sandbox.status === "error") {
    return [
      sandbox.message ||
        "Could not ensure build sandbox for publish compile preflight.",
    ];
  }
  const sessionId = sandbox.sessionId;
  const userId = opts.userId;
  const sha = opts.draftSha;
  const worktree = `/tmp/cander-publish/${sha.slice(0, 12)}`;

  // One compile attempt per publish (budget documentation).
  void BUILD_RETRY_BUDGETS.publishPreflightCompile;

  // Installation tokens expire hourly; refresh before any network git call.
  await refreshSandboxGitAuth({ sessionId, userId, fullName: opts.fullName });

  // Check out the exact publish SHA in a detached worktree so the dev server's
  // working tree (and any in-progress edit) is never touched. node_modules is
  // shared when the dependency manifest is unchanged; otherwise install fresh.
  // stderr is captured to a log and echoed on failure — never blank errors.
  const pinScript = [
    "set -e",
    `SHA=${JSON.stringify(sha)}`,
    `WT=${JSON.stringify(worktree)}`,
    "LOG=/tmp/cander-preflight-git.log; : > $LOG",
    'if ! git cat-file -e "${SHA}^{commit}" 2>/dev/null; then',
    '  git fetch --depth=1 origin "$SHA" >>$LOG 2>&1 || true',
    '  git fetch origin "$SHA" >>$LOG 2>&1 || true',
    '  git fetch --depth=30 origin cander/draft >>$LOG 2>&1 || true',
    "fi",
    'if ! git cat-file -e "${SHA}^{commit}" 2>/dev/null; then',
    "  git fetch --unshallow >>$LOG 2>&1 || true",
    '  git fetch origin "$SHA" >>$LOG 2>&1 || true',
    "fi",
    'if ! git cat-file -e "${SHA}^{commit}" 2>/dev/null; then echo FETCH_FAILED; tail -n 20 $LOG; exit 5; fi',
    'git worktree remove --force "$WT" 2>/dev/null || rm -rf "$WT"',
    'git worktree prune 2>/dev/null || true',
    'mkdir -p "$(dirname "$WT")"',
    'git worktree add --detach "$WT" "$SHA" >>$LOG 2>&1 || { echo WORKTREE_FAILED; tail -n 20 $LOG; exit 6; }',
    'DEPS_CHANGED=0',
    'if [ -d node_modules ]; then',
    '  if git diff --quiet HEAD "$SHA" -- package.json package-lock.json 2>/dev/null; then',
    '    ln -s "$(pwd)/node_modules" "$WT/node_modules"',
    '  else DEPS_CHANGED=1; fi',
    'else DEPS_CHANGED=1; fi',
    'if [ "$DEPS_CHANGED" = "1" ]; then',
    `  (cd "$WT" && timeout ${INSTALL_TIMEOUT_SEC} npm install --no-fund --no-audit > /tmp/cander-preflight-npm.log 2>&1) || { echo INSTALL_FAILED; tail -n 40 /tmp/cander-preflight-npm.log; exit 3; }`,
    "fi",
    'cd "$WT" && git rev-parse HEAD',
  ].join("\n");

  let pin = await runPrivilegedSandboxCommand({
    sessionId,
    userId,
    cmd: "sh",
    args: ["-c", pinScript],
  });

  if (pin.exitCode !== 0 && /FETCH_FAILED|WORKTREE_FAILED/.test(pin.stdout || "")) {
    // The VM's repo is unusable for this SHA (corrupt shallow clone, stale
    // objects). Fall back to a fresh shallow clone of the exact SHA into the
    // worktree path — same result, no VM recreate.
    console.warn("[cander:publish] preflight checkout failed; fresh clone fallback", {
      projectId: opts.projectId,
      detail: trimCmdOutput(pin.stdout || pin.stderr, 600),
    });
    const token = await getGitHubInstallationToken();
    const cloneScript = [
      "set -e",
      `SHA=${JSON.stringify(sha)}`,
      `WT=${JSON.stringify(worktree)}`,
      "LOG=/tmp/cander-preflight-git.log; : > $LOG",
      'rm -rf "$WT"; mkdir -p "$WT"',
      'cd "$WT"',
      "git init -q .",
      `git remote add origin ${JSON.stringify(`https://x-access-token:${token}@github.com/${opts.fullName}.git`)}`,
      'git fetch --depth=1 origin "$SHA" >>$LOG 2>&1 || { echo CLONE_FAILED; sed "s#x-access-token:[^@]*@#x-access-token:***@#g" $LOG | tail -n 20; exit 7; }',
      'git checkout -q FETCH_HEAD',
      `git remote set-url origin ${JSON.stringify(`https://github.com/${opts.fullName}.git`)}`,
      `timeout ${INSTALL_TIMEOUT_SEC} npm install --no-fund --no-audit > /tmp/cander-preflight-npm.log 2>&1 || { echo INSTALL_FAILED; tail -n 40 /tmp/cander-preflight-npm.log; exit 3; }`,
      "git rev-parse HEAD",
    ].join("\n");
    pin = await runPrivilegedSandboxCommand({
      sessionId,
      userId,
      cmd: "sh",
      args: ["-c", cloneScript],
    });
  }

  if (pin.exitCode !== 0) {
    const out = `${pin.stdout || ""}\n${pin.stderr || ""}`.trim();
    if (/INSTALL_FAILED/.test(out)) {
      return [`npm install failed during publish preflight: ${trimCmdOutput(out)}`];
    }
    return [
      `Could not check out draft SHA ${sha.slice(0, 7)} for preflight (exit ${pin.exitCode}): ${
        trimCmdOutput(out) || "git produced no output"
      }`,
    ];
  }
  const head = (pin.stdout || "").trim().split(/\s+/).pop()?.toLowerCase() || "";
  if (head && head !== sha) {
    issues.push(
      `Preflight checkout HEAD ${head.slice(0, 7)} ≠ publish SHA ${sha.slice(0, 7)}.`,
    );
    return issues;
  }

  const cleanup = async () => {
    try {
      await runPrivilegedSandboxCommand({
        sessionId,
        userId,
        cmd: "sh",
        args: ["-c", `git worktree remove --force ${JSON.stringify(worktree)} 2>/dev/null || rm -rf ${JSON.stringify(worktree)}; git worktree prune 2>/dev/null || true`],
      });
    } catch {
      /* best effort */
    }
  };

  try {
    if (!opts.skipTypecheck) {
      const tsc = await runPrivilegedSandboxCommand({
        sessionId,
        userId,
        cmd: "sh",
        args: [
          "-c",
          `cd ${JSON.stringify(worktree)} && if [ -f tsconfig.json ]; then timeout ${TSC_TIMEOUT_SEC} npx --yes tsc --noEmit > /tmp/cander-preflight-tsc.log 2>&1; echo EXIT:$?; tail -n 60 /tmp/cander-preflight-tsc.log; else echo EXIT:0; echo 'no tsconfig — skip tsc'; fi`,
        ],
      });
      const tscExit = /EXIT:(\d+)/.exec(tsc.stdout || "")?.[1];
      if (tscExit && tscExit !== "0") {
        return [
          `Typecheck failed (tsc --noEmit, exit ${tscExit}): ${trimCmdOutput(tsc.stdout || tsc.stderr)}`,
        ];
      }
    }

    // Production build: the same thing Vercel runs. Catching it here means a
    // failed build never reaches Vercel and the error text is ours to act on.
    if (productionBuildEnabled()) {
      const build = await runPrivilegedSandboxCommand({
        sessionId,
        userId,
        cmd: "sh",
        args: [
          "-c",
          `cd ${JSON.stringify(worktree)} && NEXT_TELEMETRY_DISABLED=1 CI=1 timeout ${NEXT_BUILD_TIMEOUT_SEC} npx --no-install next build > /tmp/cander-preflight-build.log 2>&1; echo EXIT:$?; grep -iE "error|failed|⨯|prerender|useSearchParams|not found|Type error" /tmp/cander-preflight-build.log | head -n 40; echo ---; tail -n 30 /tmp/cander-preflight-build.log`,
        ],
      });
      const buildExit = /EXIT:(\d+)/.exec(build.stdout || "")?.[1];
      if (buildExit && buildExit !== "0") {
        return [
          `next build failed during publish preflight (exit ${buildExit}): ${trimCmdOutput(build.stdout || build.stderr, 2500)}`,
        ];
      }
    }

    return issues;
  } finally {
    await cleanup();
  }
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
    const verified = await jobVerificationForSha({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      draftSha,
    });
    if (verified.build || (verified.typecheck && !productionBuildEnabled())) {
      console.info("[cander:publish] compile preflight skipped — builder already verified this tip", {
        projectId: opts.projectId,
        draftSha: draftSha.slice(0, 12),
        productionBuild: verified.build,
      });
      return { ok: true, draftSha, issues: [], paths, compileOk: true };
    }
    const compileIssues = await runCompilePreflight({
      userId: opts.userId,
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      draftSha,
      fullName,
      skipTypecheck: verified.typecheck,
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
