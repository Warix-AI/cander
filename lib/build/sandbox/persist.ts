/**
 * Persist sandbox working tree changes to GitHub cander/draft (Octokit).
 * Server-only. Explicit outcomes for noop / partial / delete / db sync.
 */

import { getComputerProvider } from "@/lib/computer/providers/vercel-sandbox-computer-provider";
import {
  commitFilesToDraftBranch,
  safeRepoRelativePath,
  type CommitDraftResult,
} from "@/lib/build/git/commit-draft";
import { runPrivilegedSandboxCommand } from "@/lib/build/sandbox/privileged";
import {
  parsePorcelainChanges,
  shouldSkipPersistPath,
  type PorcelainChange,
} from "@/lib/build/sandbox/porcelain";

export type { PorcelainChange };
export { parsePorcelainChanges };

const BINARY_PERSIST_RE =
  /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|pdf|zip)$/i;

/** Files that must be committed as base64 blobs (bytes, not text). */
export function isBinaryPersistPath(path: string): boolean {
  return BINARY_PERSIST_RE.test(path);
}

export type PersistSandboxOutcome = CommitDraftResult & {
  paths: string[];
  deletedPaths: string[];
  skippedPaths: string[];
  outcome: "committed" | "noop" | "partial" | "db_sync_failed";
  error?: string;
};

/**
 * Read dirty files from the sandbox and commit them to the draft branch.
 */
export async function persistSandboxToDraft(opts: {
  sessionId: string;
  userId: string;
  projectId: string;
  workspaceId: string;
  message: string;
}): Promise<PersistSandboxOutcome> {
  const status = await runPrivilegedSandboxCommand({
    sessionId: opts.sessionId,
    userId: opts.userId,
    cmd: "bash",
    args: [
      "-c",
      `set -euo pipefail
if [ ! -d .git ]; then
  git_dir=$(find . -maxdepth 3 -type d -name .git 2>/dev/null | head -1 || true)
  if [ -n "\${git_dir}" ]; then
    cd "$(dirname "\${git_dir}")"
  fi
fi
git status --porcelain -uall --untracked-files=normal 2>/dev/null || true`,
    ],
  });

  let { writes: paths, deletes: deletePaths } = parsePorcelainChanges(
    status.stdout || "",
  );

  if (paths.length > 0) {
    const expand = await runPrivilegedSandboxCommand({
      sessionId: opts.sessionId,
      userId: opts.userId,
      cmd: "sh",
      args: [
        "-c",
        `set -eu
if [ ! -d .git ]; then
  git_dir=$(find . -maxdepth 3 -type d -name .git 2>/dev/null | head -1 || true)
  if [ -n "$git_dir" ]; then cd "$(dirname "$git_dir")"; fi
fi
git status --porcelain -uall | while IFS= read -r line; do
  [ -z "$line" ] && continue
  xy=$(echo "$line" | cut -c1-2)
  rest=$(echo "$line" | cut -c4-)
  path=$(echo "$rest" | sed 's/ -> /\\n/' | tail -n1 | tr -d '"')
  case "$xy" in
    D*|?D|*D) continue ;;
  esac
  if [ -d "$path" ]; then
    find "$path" -type f ! -path '*/node_modules/*' ! -path '*/.next/*' ! -path '*/.git/*' 2>/dev/null
  elif [ -f "$path" ]; then
    echo "$path"
  fi
done | head -n 100`,
      ],
    });
    const expanded = expand.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((p) => !shouldSkipPersistPath(p));
    if (expanded.length > 0) paths = [...new Set(expanded)];
  }

  if (paths.length > 100) {
    paths = paths
      .filter(
        (p) =>
          !p.includes("node_modules/") &&
          !p.startsWith(".") &&
          !p.includes("/."),
      )
      .slice(0, 100);
  }

  if (paths.length === 0 && deletePaths.length === 0) {
    const result = await commitFilesToDraftBranch({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      message: opts.message,
      files: [],
    });
    return {
      ...result,
      paths: [],
      deletedPaths: [],
      skippedPaths: [],
      outcome: "noop",
      error: "No dirty files in the sandbox working tree to commit.",
    };
  }

  const provider = getComputerProvider();
  const files: { path: string; content: string; encoding?: "utf-8" | "base64" }[] = [];
  const skippedPaths: string[] = [];

  for (const path of paths) {
    try {
      const rel = safeRepoRelativePath(path);
      if (isBinaryPersistPath(rel)) {
        // Images / fonts: ship as base64 blobs so bytes survive the commit.
        const b64 = await runPrivilegedSandboxCommand({
          sessionId: opts.sessionId,
          userId: opts.userId,
          cmd: "sh",
          args: ["-c", `base64 -w0 ${JSON.stringify(rel)} 2>/dev/null || base64 ${JSON.stringify(rel)} | tr -d '\\n'`],
        });
        if (b64.exitCode !== 0) throw new Error(b64.stderr || "base64 read failed");
        files.push({ path: rel, content: b64.stdout.trim(), encoding: "base64" });
        continue;
      }
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
      skippedPaths.push(path);
    }
  }

  const safeDeletes = deletePaths
    .map((p) => {
      try {
        return safeRepoRelativePath(p);
      } catch {
        skippedPaths.push(p);
        return null;
      }
    })
    .filter((p): p is string => Boolean(p));

  if (files.length === 0 && safeDeletes.length === 0) {
    return {
      draftSha: "",
      draftBranch: "cander/draft",
      fullName: "",
      filesCommitted: 0,
      noop: true,
      paths: [],
      deletedPaths: [],
      skippedPaths,
      outcome: "noop",
      error:
        skippedPaths.length > 0
          ? `Could not read changed files: ${skippedPaths.slice(0, 5).join(", ")}`
          : "Nothing to commit.",
    };
  }

  const committed = await commitFilesToDraftBranch({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    message: opts.message,
    files,
    deletePaths: safeDeletes,
  });

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

  // The working tree is now the draft tip — pin it so the next ensure() reuses
  // this VM instead of recreating it (clone + npm install) on tip mismatch.
  if (committed.draftSha) {
    try {
      const { pinBuildSandboxDraftSha } = await import(
        "@/lib/build/sandbox/lifecycle"
      );
      await pinBuildSandboxDraftSha(opts.sessionId, committed.draftSha);
    } catch (err) {
      console.warn("[cander] pin sandbox draftSha failed", err);
    }
  }

  const partial = skippedPaths.length > 0;
  const outcome =
    committed.dbSyncOk === false
      ? "db_sync_failed"
      : partial
        ? "partial"
        : "committed";

  return {
    ...committed,
    paths: files.map((f) => f.path),
    deletedPaths: safeDeletes,
    skippedPaths,
    outcome,
    error:
      committed.dbSyncOk === false
        ? committed.dbSyncError ||
          "GitHub tip advanced but database draft_sha sync failed."
        : partial
          ? `Committed ${files.length} file(s); skipped ${skippedPaths.length}.`
          : undefined,
  };
}
