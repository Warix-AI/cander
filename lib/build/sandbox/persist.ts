/**
 * Persist sandbox working tree changes to GitHub cander/draft (Octokit).
 * Server-only.
 */

import { getComputerProvider } from "@/lib/computer/providers/vercel-sandbox-computer-provider";
import {
  commitFilesToDraftBranch,
  safeRepoRelativePath,
  type CommitDraftResult,
} from "@/lib/build/git/commit-draft";
import { runPrivilegedSandboxCommand } from "@/lib/build/sandbox/privileged";

const SKIP_PREFIXES = [
  "node_modules/",
  ".next/",
  "dist/",
  "build/",
  ".git/",
  ".turbo/",
  "coverage/",
  ".cache/",
  ".codex/",
  ".config/",
  ".global/",
  ".local/",
  ".npm/",
];

const SKIP_NAMES = new Set([
  ".npmrc",
  ".sudo_as_admin_successful",
  ".DS_Store",
]);

function shouldSkipPath(path: string): boolean {
  const base = path.split("/").pop() || path;
  if (SKIP_NAMES.has(base) || SKIP_NAMES.has(path)) return true;
  return SKIP_PREFIXES.some((p) => path === p.slice(0, -1) || path.startsWith(p));
}

function parsePorcelain(stdout: string): string[] {
  const paths: string[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    // XY PATH or XY ORIG -> PATH
    const rest = line.slice(3).trim();
    const path = rest.includes(" -> ")
      ? rest.split(" -> ").pop()!.trim()
      : rest.replace(/^"+|"+$/g, "");
    if (path && !shouldSkipPath(path)) {
      paths.push(path);
    }
  }
  return [...new Set(paths)];
}

/**
 * Read dirty files from the sandbox and commit them to the draft branch.
 */
export async function persistSandboxToDraft(opts: {
  sessionId: string;
  userId: string;
  projectId: string;
  workspaceId: string;
  message: string;
}): Promise<CommitDraftResult & { paths: string[] }> {
  const status = await runPrivilegedSandboxCommand({
    sessionId: opts.sessionId,
    userId: opts.userId,
    cmd: "bash",
    args: [
      "-c",
      `set -euo pipefail
# Prefer repo root even if flatten missed; never run porcelain from a non-git cwd.
if [ ! -d .git ]; then
  git_dir=$(find . -maxdepth 3 -type d -name .git 2>/dev/null | head -1 || true)
  if [ -n "\${git_dir}" ]; then
    cd "$(dirname "\${git_dir}")"
  fi
fi
git status --porcelain 2>/dev/null || true`,
    ],
  });

  let paths = parsePorcelain(status.stdout);

  // If git reports nothing but we may have written outside index, fall back to empty.
  if (paths.length === 0) {
    const result = await commitFilesToDraftBranch({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      message: opts.message,
      files: [],
    });
    return { ...result, paths: [] };
  }

  const provider = getComputerProvider();
  const files: { path: string; content: string }[] = [];

  for (const path of paths) {
    try {
      const rel = safeRepoRelativePath(path);
      // Try cwd-relative then /workspace/
      let content: string;
      try {
        content = await provider.readFile(opts.sessionId, opts.userId, rel);
      } catch {
        content = await provider.readFile(
          opts.sessionId,
          opts.userId,
          `/workspace/${rel}`,
        );
      }
      files.push({ path: rel, content });
    } catch (err) {
      console.warn("[cander] skip persist path", path, err);
    }
  }

  const committed = await commitFilesToDraftBranch({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    message: opts.message,
    files,
  });

  // Align sandbox index with remote tip (best-effort; no credentials left behind).
  try {
    await runPrivilegedSandboxCommand({
      sessionId: opts.sessionId,
      userId: opts.userId,
      cmd: "sh",
      args: [
        "-c",
        `git add -A && git reset --hard ${JSON.stringify(committed.draftSha)} 2>/dev/null || true`,
      ],
    });
  } catch {
    /* optional */
  }

  return { ...committed, paths: files.map((f) => f.path) };
}
