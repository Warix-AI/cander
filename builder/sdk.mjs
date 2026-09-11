// OpenAI Agents SDK bootstrap for the in-sandbox builder.
//
// The SDK (`@openai/agents`) is installed once per VM into ~/.cache (same
// pattern as Playwright) so the builder sources stay plain .mjs uploads.
// The SDK's OpenAI client is pointed at Cander's job-token proxy in proxy
// mode — OPENAI_API_KEY never enters the sandbox — or at api.openai.com in
// local-dev direct mode.

import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { execShell } from "./tools.mjs";

export const AGENTS_SDK_VERSION = "0.18.0";

let sdkPromise = null;

/**
 * @param {import("./events.mjs").EventLog} log
 * @returns {Promise<{ agents: typeof import("@openai/agents"), OpenAI: typeof import("openai").default }>}
 */
export function loadAgentsSdk(log) {
  if (sdkPromise) return sdkPromise;
  sdkPromise = (async () => {
    const dir = join(homedir(), ".cache", "cander-agents");
    const marker = join(dir, "node_modules", "@openai", "agents", "package.json");
    if (!existsSync(marker)) {
      log?.emit("log", "Installing agent runtime…");
      mkdirSync(dir, { recursive: true });
      const install = await execShell(
        `cd ${JSON.stringify(dir)} && (test -f package.json || npm init -y >/dev/null 2>&1) && npm i --no-audit --no-fund --silent @openai/agents@${AGENTS_SDK_VERSION} openai@^7`,
        { cwd: dir, timeoutMs: 4 * 60_000 },
      );
      if (install.exitCode !== 0) {
        throw new Error(`agent runtime install failed: ${(install.stderr || install.stdout).slice(-400)}`);
      }
    }
    const require = createRequire(join(dir, "package.json"));
    const agents = await import(require.resolve("@openai/agents"));
    const openaiMod = await import(require.resolve("openai"));
    return { agents, OpenAI: openaiMod.default || openaiMod.OpenAI };
  })();
  return sdkPromise;
}

/**
 * Point the SDK at the right OpenAI endpoint for this job.
 * @param {{ agents: any, OpenAI: any }} sdk
 * @param {{ transport: "proxy"|"direct", apiBase?: string|null, jobId: string, token?: string|null }} opts
 */
export function configureAgentsSdk(sdk, opts) {
  const { agents, OpenAI } = sdk;
  let client;
  if (opts.transport === "proxy") {
    if (!opts.apiBase || !opts.token) throw new Error("LLM proxy transport needs apiBase + job token");
    client = new OpenAI({
      apiKey: opts.token,
      baseURL: `${opts.apiBase}/api/build-jobs/${encodeURIComponent(opts.jobId)}/llm`,
      maxRetries: 4,
      timeout: 10 * 60 * 1000,
    });
    // Trace export needs a real API key; the sandbox has none. Cander keeps
    // its own run record (build_runs) — tracing is a server-side concern.
    agents.setTracingDisabled(true);
  } else {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) throw new Error("OPENAI_API_KEY missing for direct transport");
    client = new OpenAI({ apiKey: key, maxRetries: 4, timeout: 10 * 60 * 1000 });
  }
  agents.setDefaultOpenAIClient(client);
  agents.setOpenAIAPI("responses");
  return client;
}
