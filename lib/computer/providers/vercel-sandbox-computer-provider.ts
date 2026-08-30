import {
  observeSpikeBrowser,
  runSpikeAgentAction,
} from "@/lib/computer/spike/agent-browser-bootstrap";
import { runAgentBrowserCommand } from "@agent-browser/sandbox/vercel";
import { DEFAULT_SPIKE_URL } from "@/lib/computer/spike/constants";
import type {
  BrowserObservation,
  ComputerProvider,
  ComputerSessionRecord,
  CreateComputerSessionParams,
  ControlMode,
} from "@/lib/computer/computer-provider";
import {
  findActiveSessionByScope,
  getComputerSessionById,
  updateComputerSession,
} from "@/lib/computer/session-store";
import {
  attachSandbox,
  createAndBootstrapSession,
  resolveSandboxForSession,
  resolveStreamSession,
  setSessionControlMode,
  stopSessionRecordById,
} from "@/lib/computer/session-runtime";
import { assertAllowedComputerUrl, assertAllowedExecCommand } from "@/lib/computer/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getOrCreateStreamBridge,
  removeStreamBridge,
} from "@/lib/computer/spike/stream-bridge";

export class VercelSandboxComputerProvider implements ComputerProvider {
  readonly id = "vercel_sandbox";

  async createOrReuseSession(
    params: CreateComputerSessionParams,
  ): Promise<ComputerSessionRecord> {
    const existing = await findActiveSessionByScope(
      params.userId,
      params.scopeType,
      params.scopeId,
    );

    if (existing) {
      try {
        const { streamUrl } = await attachSandbox(existing);
        getOrCreateStreamBridge(existing.id, streamUrl);
        return (await getComputerSessionById(existing.id, params.userId)) ?? existing;
      } catch {
        await updateComputerSession(existing.id, { status: "error" });
      }
    }

    const url = params.url?.trim() || DEFAULT_SPIKE_URL;
    const { record, streamUrl } = await createAndBootstrapSession({
      userId: params.userId,
      scopeType: params.scopeType,
      scopeId: params.scopeId,
      url,
      chatId: params.chatId,
      projectId: params.projectId,
      workspaceId: params.workspaceId,
      taskId: params.taskId,
    });

    getOrCreateStreamBridge(record.id, streamUrl);
    return record;
  }

  async getSession(
    sessionId: string,
    userId: string,
  ): Promise<ComputerSessionRecord | null> {
    return getComputerSessionById(sessionId, userId);
  }

  async stopSession(sessionId: string, userId: string): Promise<void> {
    removeStreamBridge(sessionId);
    await stopSessionRecordById(sessionId, userId);
  }

  async browserOpen(
    sessionId: string,
    userId: string,
    url: string,
  ): Promise<BrowserObservation> {
    const safeUrl = assertAllowedComputerUrl(url);
    const resolved = await resolveSandboxForSession(sessionId, userId);
    if (!resolved) {
      throw new Error("Session not found.");
    }
    await runAgentBrowserCommand(resolved.sandbox, ["open", safeUrl]);
    const observation = await observeSpikeBrowser(resolved.sandbox);
    await updateComputerSession(sessionId, {
      current_url: observation.url,
      browser_state: { title: observation.title },
    });
    return { ...observation, sessionId };
  }

  async browserObserve(sessionId: string, userId: string): Promise<BrowserObservation> {
    const resolved = await resolveSandboxForSession(sessionId, userId);
    if (!resolved) {
      throw new Error("Session not found.");
    }
    const observation = await observeSpikeBrowser(resolved.sandbox);
    return { ...observation, sessionId };
  }

  async browserClick(
    sessionId: string,
    userId: string,
    ref: string,
  ): Promise<BrowserObservation> {
    const resolved = await resolveSandboxForSession(sessionId, userId);
    if (!resolved) {
      throw new Error("Session not found.");
    }
    const observation = await runSpikeAgentAction(resolved.sandbox, "click", [ref]);
    await updateComputerSession(sessionId, {
      current_url: observation.url,
      browser_state: { title: observation.title },
    });
    return { ...observation, sessionId };
  }

  async browserFill(
    sessionId: string,
    userId: string,
    ref: string,
    value: string,
  ): Promise<BrowserObservation> {
    const resolved = await resolveSandboxForSession(sessionId, userId);
    if (!resolved) {
      throw new Error("Session not found.");
    }
    const observation = await runSpikeAgentAction(resolved.sandbox, "fill", [ref, value]);
    return { ...observation, sessionId };
  }

  async browserNavigate(
    sessionId: string,
    userId: string,
    url: string,
  ): Promise<BrowserObservation> {
    return this.browserOpen(sessionId, userId, url);
  }

  async setControlMode(
    sessionId: string,
    userId: string,
    mode: ControlMode,
  ): Promise<ControlMode> {
    const updated = await setSessionControlMode(sessionId, userId, mode);
    if (!updated) {
      throw new Error("Session not found.");
    }
    return mode;
  }

  async getStreamUrl(sessionId: string, userId: string): Promise<string | null> {
    const resolved = await resolveStreamSession(sessionId, userId);
    return resolved?.streamUrl ?? null;
  }

  async exec(
    sessionId: string,
    userId: string,
    command: string,
    args: string[] = [],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    assertAllowedExecCommand(command);
    const resolved = await resolveSandboxForSession(sessionId, userId);
    if (!resolved) {
      throw new Error("Session not found.");
    }
    const result = await resolved.sandbox.runCommand({
      cmd: command,
      args,
    });
    return {
      stdout: await result.stdout(),
      stderr: await result.stderr(),
      exitCode: result.exitCode ?? 0,
    };
  }

  async writeFile(
    sessionId: string,
    userId: string,
    path: string,
    content: string,
  ): Promise<void> {
    const resolved = await resolveSandboxForSession(sessionId, userId);
    if (!resolved) {
      throw new Error("Session not found.");
    }
    const encoded = Buffer.from(content, "utf8").toString("base64");
    await resolved.sandbox.runCommand({
      cmd: "sh",
      args: [
        "-c",
        `mkdir -p "$(dirname ${JSON.stringify(path)})" && echo ${JSON.stringify(encoded)} | base64 -d > ${JSON.stringify(path)}`,
      ],
    });
  }

  async readFile(sessionId: string, userId: string, path: string): Promise<string> {
    const result = await this.exec(sessionId, userId, "cat", [path]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to read ${path}`);
    }
    return result.stdout;
  }

  async restoreProject(
    sessionId: string,
    userId: string,
    projectId: string,
  ): Promise<{ fileCount: number }> {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("project_files")
      .select("path, content")
      .eq("project_id", projectId);
    if (error) {
      throw new Error(error.message);
    }
    const files = data ?? [];
    for (const file of files) {
      if (!file.path) {
        continue;
      }
      await this.writeFile(
        sessionId,
        userId,
        `/workspace/${file.path}`,
        file.content ?? "",
      );
    }
    return { fileCount: files.length };
  }
}

let provider: VercelSandboxComputerProvider | null = null;

export function getComputerProvider(): VercelSandboxComputerProvider {
  if (!provider) {
    provider = new VercelSandboxComputerProvider();
  }
  return provider;
}
