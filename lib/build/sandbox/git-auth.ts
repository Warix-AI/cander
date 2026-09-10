/**
 * GitHub auth for git commands that run *inside* a build sandbox.
 *
 * The clone URL used to embed a GitHub App installation token, which expires
 * after an hour — every later `git fetch` in a long-lived sandbox failed
 * silently (fast-forward, persist reset, publish preflight). Instead the
 * remote is token-free and a `store` credential helper is refreshed with a
 * fresh installation token right before any network git operation.
 * Server-only.
 */

import { getGitHubInstallationToken } from "@/lib/build/git/installation-token";
import { runPrivilegedSandboxCommand, runOnSandbox } from "@/lib/build/sandbox/privileged";
import type { AgentBrowserSandbox } from "@/lib/computer/spike/agent-browser-bootstrap";

export const SANDBOX_GIT_CREDENTIALS_FILE = "/tmp/.cander-git-credentials";

function credentialScript(token: string, fullName: string): string {
  const cleanUrl = `https://github.com/${fullName}.git`;
  const line = `https://x-access-token:${token}@github.com`;
  return [
    "set -e",
    "[ -d .git ] || exit 0",
    `git remote set-url origin ${JSON.stringify(cleanUrl)} 2>/dev/null || git remote add origin ${JSON.stringify(cleanUrl)}`,
    `git config credential.helper ${JSON.stringify(`store --file=${SANDBOX_GIT_CREDENTIALS_FILE}`)}`,
    `umask 077; printf '%s\\n' ${JSON.stringify(line)} > ${SANDBOX_GIT_CREDENTIALS_FILE}`,
    "echo GIT_AUTH_OK",
  ].join("\n");
}

/** Refresh in-sandbox git credentials using a handle we already hold. */
export async function configureSandboxGitAuth(
  sandbox: AgentBrowserSandbox,
  fullName: string,
): Promise<boolean> {
  try {
    const token = await getGitHubInstallationToken();
    const res = await runOnSandbox(sandbox, "sh", ["-c", credentialScript(token, fullName)]);
    return res.exitCode === 0 && /GIT_AUTH_OK/.test(res.stdout);
  } catch (err) {
    console.warn("[cander:sandbox] git auth configure failed", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Refresh in-sandbox git credentials by session id (before fetch/pull). */
export async function refreshSandboxGitAuth(opts: {
  sessionId: string;
  userId: string;
  fullName: string;
}): Promise<boolean> {
  try {
    const token = await getGitHubInstallationToken();
    const res = await runPrivilegedSandboxCommand({
      sessionId: opts.sessionId,
      userId: opts.userId,
      cmd: "sh",
      args: ["-c", credentialScript(token, opts.fullName)],
    });
    return res.exitCode === 0 && /GIT_AUTH_OK/.test(res.stdout);
  } catch (err) {
    console.warn("[cander:sandbox] git auth refresh failed", err instanceof Error ? err.message : err);
    return false;
  }
}
