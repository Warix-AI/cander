import {
  createAgentBrowserSandbox,
  runAgentBrowserCommand,
  type VercelSandboxSession,
} from "@agent-browser/sandbox/vercel";
import { DEFAULT_SPIKE_URL, STREAM_PORT } from "@/lib/computer/spike/constants";
import { assertAllowedComputerUrl } from "@/lib/computer/security";
import type { BrowserObservation } from "@/lib/computer/spike/types";

/** Vercel Sandbox instance returned by createAgentBrowserSandbox (includes domain()). */
export type AgentBrowserSandbox = VercelSandboxSession & {
  domain(port: number): string;
  runCommand(params: {
    cmd: string;
    args?: string[];
    env?: Record<string, string>;
    detached?: boolean;
  }): Promise<{ exitCode?: number; stderr(): Promise<string>; stdout(): Promise<string> }>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryParseJson(str: string): { data?: { title?: string; url?: string } } | null {
  try {
    return JSON.parse(str) as { data?: { title?: string; url?: string } };
  } catch {
    return null;
  }
}

export type BootstrapResult = {
  sandbox: AgentBrowserSandbox;
  streamUrl: string;
  observation: BrowserObservation;
};

/**
 * Create a persistent Vercel Sandbox with agent-browser + streaming enabled.
 * The browser daemon stays alive for human/agent handoff.
 */
export async function bootstrapSpikeBrowser(
  url: string = DEFAULT_SPIKE_URL,
  sandboxName?: string,
): Promise<BootstrapResult> {
  const safeUrl = assertAllowedComputerUrl(url);
  const sandbox = (await createAgentBrowserSandbox({
    createOptions: {
      ...(sandboxName ? { name: sandboxName } : {}),
      ports: [STREAM_PORT],
      timeout: 600_000,
      env: {
        AGENT_BROWSER_STREAM_PORT: String(STREAM_PORT),
      },
    },
  })) as AgentBrowserSandbox;

  await sandbox.runCommand({
    cmd: "agent-browser",
    args: ["open", safeUrl],
    env: { AGENT_BROWSER_STREAM_PORT: String(STREAM_PORT) },
    detached: true,
  });

  // Allow Chrome + stream server to start before connecting.
  await sleep(4_000);

  const streamUrl = sandbox.domain(STREAM_PORT);

  const titleResult = await runAgentBrowserCommand(sandbox, ["get", "title", "--json"]);
  const titleJson = tryParseJson(titleResult.stdout);
  const title = titleJson?.data?.title ?? safeUrl;

  const urlResult = await runAgentBrowserCommand(sandbox, ["get", "url", "--json"]);
  const urlJson = tryParseJson(urlResult.stdout);
  const currentUrl = urlJson?.data?.url ?? safeUrl;

  const snapResult = await runAgentBrowserCommand(
    sandbox,
    ["snapshot", "-i", "-c"],
    { json: false },
  );

  return {
    sandbox,
    streamUrl,
    observation: {
      url: currentUrl,
      title,
      snapshot: snapResult.stdout,
    },
  };
}

export async function observeSpikeBrowser(
  sandbox: AgentBrowserSandbox,
): Promise<BrowserObservation> {
  const titleResult = await runAgentBrowserCommand(sandbox, ["get", "title", "--json"]);
  const titleJson = tryParseJson(titleResult.stdout);
  const title = titleJson?.data?.title ?? "";

  const urlResult = await runAgentBrowserCommand(sandbox, ["get", "url", "--json"]);
  const urlJson = tryParseJson(urlResult.stdout);
  const url = urlJson?.data?.url ?? "";

  const snapResult = await runAgentBrowserCommand(
    sandbox,
    ["snapshot", "-i", "-c"],
    { json: false },
  );

  return {
    url,
    title,
    snapshot: snapResult.stdout,
  };
}

export async function runSpikeAgentAction(
  sandbox: AgentBrowserSandbox,
  action: "click" | "fill" | "press" | "scroll",
  args: string[],
): Promise<BrowserObservation> {
  await runAgentBrowserCommand(sandbox, [action, ...args]);
  await sleep(500);
  return observeSpikeBrowser(sandbox);
}
