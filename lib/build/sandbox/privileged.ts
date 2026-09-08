/**
 * Privileged sandbox commands for server-orchestrated git sync.
 * Bypasses the AI exec allowlist — never expose to model-controlled args blindly.
 */

import type { AgentBrowserSandbox } from "@/lib/computer/spike/agent-browser-bootstrap";
import { resolveSandboxForSession } from "@/lib/computer/session-runtime";

export async function runPrivilegedSandboxCommand(opts: {
  sessionId: string;
  userId: string;
  cmd: string;
  args?: string[];
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const resolved = await resolveSandboxForSession(opts.sessionId, opts.userId);
  if (!resolved) {
    throw new Error("Sandbox session not found.");
  }
  return runOnSandbox(resolved.sandbox, opts.cmd, opts.args ?? []);
}

export async function runOnSandbox(
  sandbox: AgentBrowserSandbox,
  cmd: string,
  args: string[] = [],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await sandbox.runCommand({ cmd, args });
  return {
    stdout: await result.stdout(),
    stderr: await result.stderr(),
    exitCode: result.exitCode ?? 0,
  };
}
