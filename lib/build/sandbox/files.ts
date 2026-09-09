/**
 * Server helpers for AI sandbox file/exec ops on a Build project.
 * Ensures sandbox, then uses ComputerProvider. Callers must assertProjectAccess.
 */

import { ensureProjectSandbox } from "@/lib/build/sandbox/lifecycle";
import { getComputerProvider } from "@/lib/computer/providers/vercel-sandbox-computer-provider";
import { safeRepoRelativePath } from "@/lib/build/git/commit-draft";
import { runPrivilegedSandboxCommand } from "@/lib/build/sandbox/privileged";
import { persistSandboxToDraft } from "@/lib/build/sandbox/persist";

function toSandboxPath(rel: string): string {
  return rel.startsWith("/") ? rel : rel;
}

export async function ensureBuildSandboxSession(opts: {
  userId: string;
  projectId: string;
  workspaceId: string;
}): Promise<{ sessionId: string }> {
  const ensured = await ensureProjectSandbox(opts);
  // File/exec ops only need a live VM. "starting" is normal before package.json
  // exists / Next is listening — blocking writes here caused empty drafts
  // ("couldn't write files into the sandbox") and endless preview spin.
  if (!ensured.sessionId) {
    throw new Error(
      ensured.message || `Sandbox not ready (${ensured.status}).`,
    );
  }
  if (
    ensured.status === "error" ||
    ensured.status === "unavailable" ||
    ensured.status === "needs_repo" ||
    ensured.status === "idle"
  ) {
    throw new Error(
      ensured.message || `Sandbox not ready (${ensured.status}).`,
    );
  }
  return { sessionId: ensured.sessionId };
}

export async function sandboxWriteFile(opts: {
  userId: string;
  projectId: string;
  workspaceId: string;
  path: string;
  content: string;
  persist?: boolean;
}): Promise<{ sessionId: string; path: string; persisted?: boolean; draftSha?: string }> {
  const { sessionId } = await ensureBuildSandboxSession(opts);
  const rel = safeRepoRelativePath(opts.path);
  const provider = getComputerProvider();
  await provider.writeFile(sessionId, opts.userId, toSandboxPath(rel), opts.content);

  if (opts.persist) {
    const result = await persistSandboxToDraft({
      sessionId,
      userId: opts.userId,
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      message: `Cander: update ${rel}`,
    });
    return {
      sessionId,
      path: rel,
      persisted: !result.noop,
      draftSha: result.draftSha,
    };
  }
  return { sessionId, path: rel };
}

export async function sandboxReadFile(opts: {
  userId: string;
  projectId: string;
  workspaceId: string;
  path: string;
}): Promise<{ sessionId: string; path: string; content: string }> {
  const { sessionId } = await ensureBuildSandboxSession(opts);
  const rel = safeRepoRelativePath(opts.path);
  const provider = getComputerProvider();
  let content: string;
  try {
    content = await provider.readFile(sessionId, opts.userId, toSandboxPath(rel));
  } catch {
    content = await provider.readFile(
      sessionId,
      opts.userId,
      `/workspace/${rel}`,
    );
  }
  return { sessionId, path: rel, content };
}

export async function sandboxListFiles(opts: {
  userId: string;
  projectId: string;
  workspaceId: string;
  path?: string;
}): Promise<{ sessionId: string; entries: string[] }> {
  const { sessionId } = await ensureBuildSandboxSession(opts);
  const dir = opts.path ? safeRepoRelativePath(opts.path) : ".";
  const result = await runPrivilegedSandboxCommand({
    sessionId,
    userId: opts.userId,
    cmd: "sh",
    args: ["-c", `ls -la ${JSON.stringify(dir)} 2>/dev/null | head -200`],
  });
  return {
    sessionId,
    entries: result.stdout.split("\n").filter(Boolean),
  };
}

export async function sandboxExecAllowed(opts: {
  userId: string;
  projectId: string;
  workspaceId: string;
  command: string;
  args?: string[];
}): Promise<{
  sessionId: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const { sessionId } = await ensureBuildSandboxSession(opts);
  const provider = getComputerProvider();
  const result = await provider.exec(
    sessionId,
    opts.userId,
    opts.command,
    opts.args ?? [],
  );
  return { sessionId, ...result };
}
