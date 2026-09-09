/**
 * Build project chat turns — write into the sandbox instead of dumping HTML in chat.
 */

import type {
  AgentTurnOptions,
  AgentTurnResult,
} from "@/lib/ai/runtime/agent-turn";
import { runRawOpenAITurn } from "@/lib/ai/raw-openai/run-turn";
import {
  executeAuthorizedTool,
  formatToolsForPrompt,
  type AiToolCallResult,
} from "@/lib/ai/runtime/tools";
import type { AiGenerateRequest } from "@/lib/ai/runtime/types";
import {
  parseToolCallFromContent,
  sanitizeAssistantVisibleText,
} from "@/lib/ai/tool-protocol";
import { TOOL_DOMAINS } from "@/lib/ai/tools/domains";
import { isBuildCreateIntent } from "@/lib/ai/build/capabilities";

const MAX_ROUNDS = 10;

const BUILD_PROJECT_INSTRUCTIONS = `You are Cander Build — you implement websites and apps IN the user's project sandbox.

Rules:
- Never paste a full HTML document as the answer. Write real project files with tools.
- Prefer a Next.js App Router scaffold (package.json, app/layout.js, app/page.js, next.config.mjs).
- Use next@16.3.1 (or newer patched), react@19, react-dom@19 — never vulnerable Next 15.0–15.5.6.
- After scaffolding, persist files (computer.files.write persists by default).
- Keep user-facing replies short: what you built + how to preview. No giant code dumps.
- Call tools as JSON: {"tool":"computer.files.write","arguments":{"path":"app/page.js","content":"..."}}

Workflow for "create a website/app":
1. computer.files.list to see current files (optional).
2. computer.files.write for package.json, next.config.mjs, app/layout.js, app/page.js (and .gitignore).
3. Summarize briefly.`;

function buildToolNames(): string[] {
  return [
    ...TOOL_DOMAINS.build,
    "computer.files.read",
    "computer.files.write",
    "computer.files.patch",
    "computer.files.list",
    "computer.exec",
  ];
}

function formatToolResultsNote(results: AiToolCallResult[]): string {
  return results
    .map((r) => `Tool ${r.name} (${r.ok ? "ok" : "failed"}):\n${r.output}`)
    .join("\n\n");
}

function isBuildToolName(name: string): boolean {
  return (
    name.startsWith("build.") ||
    name.startsWith("computer.files") ||
    name === "computer.exec"
  );
}

function looksLikeHtmlDump(text: string): boolean {
  const t = (text || "").trim();
  return (
    /<!DOCTYPE\s+html/i.test(t) ||
    (/<html[\s>]/i.test(t) && /<style[\s>]/i.test(t)) ||
    (t.includes("```html") && t.length > 400)
  );
}

function labelForBuildTool(name: string): string {
  if (name === "computer.files.write") return "Writing project files…";
  if (name === "computer.files.list") return "Checking project files…";
  if (name === "computer.files.read") return "Reading project file…";
  if (name === "computer.exec") return "Running command…";
  if (name.startsWith("build.")) return "Updating build…";
  return "Working in project…";
}

async function ensureSandboxReady(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<{ ok: boolean; detail: string }> {
  try {
    const { ensureProjectSandboxClient } = await import(
      "@/lib/api/project-sandbox-client"
    );
    const { ensureProjectInfraClient } = await import(
      "@/lib/api/project-infra-client"
    );
    await ensureProjectInfraClient({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
    });
    const result = await ensureProjectSandboxClient({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
    });
    if (!result) {
      return { ok: false, detail: "Sign in required to start the build environment." };
    }
    if (result.status === "error" || result.ok === false) {
      return {
        ok: false,
        detail: result.message || result.error || "Sandbox failed to start.",
      };
    }
    return {
      ok: true,
      detail: result.message || `Sandbox ${result.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runBuildProjectTurn(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  const report = opts?.onProgress ?? (() => {});
  const projectId = request.projectId?.trim() || "";
  const workspaceId = request.workspaceId?.trim() || "";
  const allowedTools = buildToolNames();
  const toolResults: AiToolCallResult[] = [];
  let forcedToolRetry = false;

  if (!projectId || !workspaceId) {
    return {
      content:
        "Open a Build project first, then ask me to create or edit the site.",
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
    };
  }

  report({
    phase: "thinking",
    label: "Preparing environment",
    detail: "Starting project sandbox…",
  });

  const sandbox = await ensureSandboxReady({ projectId, workspaceId });
  if (!sandbox.ok) {
    return {
      content: `I couldn’t start the project environment: ${sandbox.detail}`,
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
    };
  }

  report({
    phase: "thinking",
    label: "Building",
    detail: sandbox.detail,
  });

  let working: AiGenerateRequest = {
    ...request,
    allowTools: true,
    allowedToolNames: allowedTools,
    toolContext: [
      formatToolsForPrompt(allowedTools),
      BUILD_PROJECT_INSTRUCTIONS,
      `Active projectId: ${projectId}`,
      `workspaceId: ${workspaceId}`,
      "Implement the user's request with computer.files.* tools now.",
    ].join("\n\n"),
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (opts?.signal?.aborted) {
      return {
        content: "",
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults: toolResults.length ? toolResults : undefined,
      };
    }

    if (round > 0) {
      report({
        phase: "follow_up",
        label: "Building",
        detail: "Continuing…",
        contentStreaming: true,
      });
    }

    const generated = await runRawOpenAITurn(working, {
      ...opts,
      suppressContentDelta: true,
    });
    const { text, call } = parseToolCallFromContent(generated.content);

    let toolCall = call;
    if (toolCall && !allowedTools.includes(toolCall.name)) toolCall = null;
    if (toolCall && !isBuildToolName(toolCall.name)) toolCall = null;

    if (!toolCall) {
      const visible =
        sanitizeAssistantVisibleText(text || generated.content).trim() || "";
      const writes = toolResults.filter(
        (r) => r.name === "computer.files.write" && r.ok,
      ).length;
      const needsForce =
        !forcedToolRetry &&
        writes === 0 &&
        (isBuildCreateIntent(request.content) || looksLikeHtmlDump(visible));

      if (needsForce) {
        forcedToolRetry = true;
        working = {
          ...working,
          toolContext: [
            formatToolsForPrompt(allowedTools),
            BUILD_PROJECT_INSTRUCTIONS,
            formatToolResultsNote(toolResults),
            "CRITICAL: Do not paste HTML in chat. Call computer.files.write now for package.json and app/page.js.",
            'Example: {"tool":"computer.files.write","arguments":{"path":"package.json","content":"{\\"name\\":\\"site\\",\\"private\\":true,\\"scripts\\":{\\"dev\\":\\"next dev --hostname 0.0.0.0 --port 3000\\",\\"build\\":\\"next build\\"},\\"dependencies\\":{\\"next\\":\\"16.3.1\\",\\"react\\":\\"19.1.0\\",\\"react-dom\\":\\"19.1.0\\"}}"}}',
          ].join("\n\n"),
          content: [
            request.content,
            "",
            "Write the Next.js files with computer.files.write. No HTML-only replies.",
          ].join("\n"),
        };
        continue;
      }

      return {
        content:
          visible ||
          (writes > 0
            ? `Updated ${writes} file${writes === 1 ? "" : "s"} in your project. Preview should refresh shortly.`
            : "Done."),
        runtime: generated.runtime ?? "cloud",
        offline: Boolean(generated.offline),
        condensationOccurred: Boolean(generated.condensationOccurred),
        aiChatId: generated.aiChatId ?? request.aiChatId ?? null,
        toolResults: toolResults.length ? toolResults : undefined,
        blocks: generated.blocks,
      };
    }

    report({
      phase: "tool",
      label: "Building",
      detail: labelForBuildTool(toolCall.name),
      toolName: toolCall.name,
      contentStreaming: true,
    });

    const result = await executeAuthorizedTool({
      name: toolCall.name,
      arguments: {
        projectId,
        workspaceId,
        ...(toolCall.arguments ?? {}),
      },
    });
    toolResults.push(result);
    report({
      phase: "follow_up",
      label: "Building",
      detail: labelForBuildTool(toolCall.name),
      toolName: toolCall.name,
      toolOk: result.ok,
      contentStreaming: true,
    });

    working = {
      ...working,
      toolContext: [
        formatToolsForPrompt(allowedTools),
        BUILD_PROJECT_INSTRUCTIONS,
        formatToolResultsNote(toolResults),
        "Continue with more file writes if needed, then a short user summary.",
      ].join("\n\n"),
      content: request.content,
      messages: [
        ...(request.messages ?? []),
        { role: "assistant", content: generated.content },
        {
          role: "user",
          content: `Tool result for ${result.name}: ${result.ok ? "ok" : "failed"}\n${result.output}`,
        },
      ],
    };
  }

  const writes = toolResults.filter(
    (r) => r.name === "computer.files.write" && r.ok,
  ).length;

  if (writes > 0) {
    // Nudge preview so the path proxy picks up new files.
    try {
      const { ensureProjectSandboxClient } = await import(
        "@/lib/api/project-sandbox-client"
      );
      await ensureProjectSandboxClient({
        projectId,
        workspaceId,
        forceRestart: true,
      });
    } catch {
      /* best-effort */
    }
  }

  return {
    content:
      writes > 0
        ? `Updated ${writes} file${writes === 1 ? "" : "s"} in your project sandbox. Open Preview to see the draft.`
        : "I hit the step limit before finishing. Try again with a narrower request.",
    runtime: "cloud",
    offline: false,
    condensationOccurred: false,
    aiChatId: request.aiChatId ?? null,
    toolResults,
  };
}
