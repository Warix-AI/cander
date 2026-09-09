/**
 * Build project chat turns.
 *
 * Architecture:
 * - Plan / clarify (themes, URLs, UI, goals) → normal chat model, no code dumps.
 * - Implement / create → Codex (coding model) writes files into the sandbox.
 * Sites use crawlable Next.js App Router SSR (server components + metadata).
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
import {
  isBuildCreateIntent,
  isBuildIntent,
} from "@/lib/ai/build/capabilities";
import { composeSiteFromSpec } from "@/lib/ai/build/compose-site";
import { planWebsite } from "@/lib/ai/build/plan-website";
import type { ScaffoldFile } from "@/lib/ai/build/site-spec";

const MAX_ROUNDS = 10;

const PLAN_INTENT_RE =
  /\b(plan|planning|brainstorm|outline|theme|themes|mood\s*board|wireframe|sitemap|ia\b|information\s*architecture|what\s+should|help\s+me\s+(decide|figure)|before\s+we\s+build|don'?t\s+build\s+yet|just\s+plan)\b/i;

const IMPLEMENT_INTENT_RE =
  /\b(implement|build\s+it|create\s+it|scaffold|ship\s+it|go\s+ahead|make\s+it|write\s+the\s+code|start\s+coding|let'?s\s+build|do\s+it|run\s+supabase|set\s+up\s+supabase)\b/i;

const BUILD_PLAN_INSTRUCTIONS = `You are Cander Build — planning partner for websites and apps.

You help the user clarify what to build BEFORE code exists. Structure replies with short sections when useful:
1. Goal — what the site/app should do
2. Theme & brand — tone, colors, typography direction
3. Structure / URLs — pages or screens and suggested paths
4. UI design — layout, key components, CTA
5. Data & backend — only if needed (auth, Supabase, forms); apps lean heavier here
6. Next step — ask one clear question, or invite them to say "build it" / "implement"

Rules:
- Do NOT paste HTML, JSX, React components, or package.json.
- Do NOT invent file contents. Planning only.
- Keep it concrete and skim-friendly.`;

const BUILD_PROJECT_INSTRUCTIONS = `You are Cander Build — Codex implements IN the user's project sandbox.

Rules:
- Never paste a full HTML/JSX document as the answer. Write real project files with tools.
- Prefer Next.js App Router SSR (server components). Sites must be crawlable: real HTML from the server, metadata title/description, robots.txt + sitemap.
- Use next@16.3.1 (or newer patched), react@19, react-dom@19 — never vulnerable Next 15.0–15.5.6.
- No "use client" on the main landing page unless interactivity is required.
- After scaffolding, persist files (computer.files.write persists by default).
- Keep user-facing replies short: what you built + how to preview. No giant code dumps.
- Call tools as JSON: {"tool":"computer.files.write","arguments":{"path":"app/page.js","content":"..."}}
- Supabase / databases: only when the user asks or the plan clearly needs them — use build.* tools when available.

Workflow for "create a website/app":
1. computer.files.list to see current files (optional).
2. computer.files.write for package.json, next.config.mjs, app/layout.js, app/page.js, app/robots.js, app/sitemap.js, .gitignore.
3. Summarize briefly.`;

function isBuildPlanIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isBuildCreateIntent(t) || IMPLEMENT_INTENT_RE.test(t)) return false;
  return PLAN_INTENT_RE.test(t);
}

function buildToolNames(): string[] {
  return [
    ...TOOL_DOMAINS.build,
    "computer.files.read",
    "computer.files.write",
    "computer.files.patch",
    "computer.files.list",
    "computer.files.persist",
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

function looksLikeCodeDump(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (/<!DOCTYPE\s+html/i.test(t)) return true;
  if (/<html[\s>]/i.test(t) && /<style[\s>]/i.test(t)) return true;
  if (/```(?:html|javascript|tsx|jsx|css|typescript)/i.test(t) && t.length > 280) {
    return true;
  }
  if (
    /\b(?:app\/page\.(?:js|tsx)|package\.json)\b/i.test(t) &&
    /export\s+default\s+function/i.test(t)
  ) {
    return true;
  }
  if (
    /export\s+default\s+function\s+\w+/i.test(t) &&
    /return\s*\(\s*</.test(t) &&
    t.length > 400
  ) {
    return true;
  }
  return false;
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
  forceRestart?: boolean;
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
      forceRestart: opts.forceRestart,
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


async function writeScaffold(opts: {
  projectId: string;
  workspaceId: string;
  files: ScaffoldFile[];
  report: NonNullable<AgentTurnOptions["onProgress"]>;
}): Promise<AiToolCallResult[]> {
  const results: AiToolCallResult[] = [];
  for (const file of opts.files) {
    opts.report({
      phase: "tool",
      label: "Building",
      detail: `Writing ${file.path}…`,
      toolName: "computer.files.write",
      contentStreaming: true,
    });
    const result = await executeAuthorizedTool({
      name: "computer.files.write",
      arguments: {
        projectId: opts.projectId,
        workspaceId: opts.workspaceId,
        path: file.path,
        content: file.content,
        persist: false,
      },
    });
    results.push(result);
    opts.report({
      phase: "follow_up",
      label: "Building",
      detail: `Writing ${file.path}…`,
      toolName: "computer.files.write",
      toolOk: result.ok,
      contentStreaming: true,
    });
  }

  const okWrites = results.filter((r) => r.ok).length;
  if (okWrites > 0) {
    opts.report({
      phase: "tool",
      label: "Building",
      detail: "Saving draft to GitHub…",
      toolName: "computer.files.persist",
      contentStreaming: true,
    });
    const persist = await executeAuthorizedTool({
      name: "computer.files.persist",
      arguments: {
        projectId: opts.projectId,
        workspaceId: opts.workspaceId,
      },
    });
    results.push(persist);
    opts.report({
      phase: "follow_up",
      label: "Building",
      detail: "Saving draft to GitHub…",
      toolName: "computer.files.persist",
      toolOk: persist.ok,
      contentStreaming: true,
    });
  }

  return results;
}

async function runBuildPlanTurn(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  const report = opts?.onProgress ?? (() => {});
  report({
    phase: "thinking",
    label: "Planning",
    detail: "Clarifying goals, theme, URLs, and UI…",
  });

  const generated = await runRawOpenAITurn(
    {
      ...request,
      allowTools: false,
      toolContext: BUILD_PLAN_INSTRUCTIONS,
      modelMode: "chat",
      allowedToolNames: undefined,
    },
    opts,
  );

  let content =
    sanitizeAssistantVisibleText(generated.content || "").trim() ||
    generated.content ||
    "";
  if (looksLikeCodeDump(content)) {
    content =
      "Let’s stay in planning mode — no code yet.\n\n" +
      "Tell me more about **goal**, **theme**, **pages/URLs**, and **UI**, " +
      "or say **build it** when you want Codex to implement in your sandbox.";
  }

  return {
    content,
    runtime: generated.runtime ?? "cloud",
    offline: Boolean(generated.offline),
    condensationOccurred: Boolean(generated.condensationOccurred),
    aiChatId: generated.aiChatId ?? request.aiChatId ?? null,
    blocks: generated.blocks,
  };
}

async function runCodingAgentLoop(
  request: AiGenerateRequest,
  opts: AgentTurnOptions | undefined,
  ctx: {
    projectId: string;
    workspaceId: string;
    allowedTools: string[];
    priorResults?: AiToolCallResult[];
    maxRounds?: number;
  },
): Promise<AgentTurnResult> {
  const report = opts?.onProgress ?? (() => {});
  const toolResults: AiToolCallResult[] = [...(ctx.priorResults ?? [])];
  const rounds = ctx.maxRounds ?? 4;
  let forcedToolRetry = false;
  let working: AiGenerateRequest = {
    ...request,
    allowTools: true,
    allowedToolNames: ctx.allowedTools,
    modelMode: "coding",
    toolContext:
      request.toolContext ||
      [
        formatToolsForPrompt(ctx.allowedTools),
        BUILD_PROJECT_INSTRUCTIONS,
        `Active projectId: ${ctx.projectId}`,
        `workspaceId: ${ctx.workspaceId}`,
      ].join("\n\n"),
  };

  for (let round = 0; round < rounds; round++) {
    if (opts?.signal?.aborted) {
      return {
        content: "",
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
      };
    }
    const generated = await runRawOpenAITurn(working, {
      ...opts,
      suppressContentDelta: true,
    });
    const { text, call } = parseToolCallFromContent(generated.content);
    let toolCall = call;
    if (toolCall && !ctx.allowedTools.includes(toolCall.name)) toolCall = null;
    if (toolCall && !isBuildToolName(toolCall.name)) toolCall = null;

    if (!toolCall) {
      const visible =
        sanitizeAssistantVisibleText(text || generated.content).trim() || "";
      const writes = toolResults.filter(
        (r) => r.name === "computer.files.write" && r.ok,
      ).length;
      if (
        !forcedToolRetry &&
        writes === (ctx.priorResults?.filter((r) => r.name === "computer.files.write" && r.ok).length ?? 0) &&
        looksLikeCodeDump(visible)
      ) {
        forcedToolRetry = true;
        working = {
          ...working,
          content: `${request.content}\n\nUse computer.files.write only. No code dumps.`,
        };
        continue;
      }
      return {
        content: visible || (writes > 0 ? `Updated project files for custom gaps.` : ""),
        runtime: generated.runtime ?? "cloud",
        offline: Boolean(generated.offline),
        condensationOccurred: Boolean(generated.condensationOccurred),
        aiChatId: generated.aiChatId ?? request.aiChatId ?? null,
        toolResults,
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
        projectId: ctx.projectId,
        workspaceId: ctx.workspaceId,
        ...(toolCall.arguments ?? {}),
      },
    });
    toolResults.push(result);
    working = {
      ...working,
      messages: [
        ...(request.messages ?? []),
        { role: "assistant", content: generated.content },
        {
          role: "user",
          content: `Tool result for ${result.name}: ${result.ok ? "ok" : "failed"}\n${result.output}`,
        },
      ],
      toolContext: [
        formatToolsForPrompt(ctx.allowedTools),
        BUILD_PROJECT_INSTRUCTIONS,
        formatToolResultsNote(toolResults),
        "Continue only if more gap work remains, then summarize briefly.",
      ].join("\n\n"),
    };
  }

  return {
    content: "Finished the custom-gap pass.",
    runtime: "cloud",
    offline: false,
    condensationOccurred: false,
    aiChatId: request.aiChatId ?? null,
    toolResults,
  };
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

  // Planning stays on the chat model — no sandbox / no file writes.
  if (isBuildPlanIntent(request.content) && !isBuildCreateIntent(request.content)) {
    return runBuildPlanTurn(request, opts);
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

  // Deterministic create path — SiteSpec plan → compose → batched persist.
  if (isBuildCreateIntent(request.content) || IMPLEMENT_INTENT_RE.test(request.content)) {
    report({
      phase: "thinking",
      label: "Building",
      detail: "Planning site design, then composing the project…",
    });
    const spec = await planWebsite(request, opts);
    const files = composeSiteFromSpec(spec);
    const written = await writeScaffold({
      projectId,
      workspaceId,
      files,
      report,
    });
    toolResults.push(...written);
    const okWrites = written.filter(
      (r) => r.name === "computer.files.write" && r.ok,
    ).length;
    const failed = written.filter((r) => !r.ok);

    if (okWrites === 0) {
      return {
        content: `I couldn’t write files into the sandbox${
          failed[0]?.output ? `: ${failed[0].output}` : "."
        }`,
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
      };
    }

    // Soft refresh — do not destroy/reclone/npm-install unless needed.
    await ensureSandboxReady({ projectId, workspaceId, forceRestart: false });

    const gaps = spec.customGaps.filter(Boolean);
    let gapNote = "";
    if (gaps.length > 0) {
      report({
        phase: "thinking",
        label: "Building",
        detail: "Filling custom gaps with the coding agent…",
      });
      const gapRequest: AiGenerateRequest = {
        ...request,
        content: [
          request.content,
          "",
          `Site scaffold for ${spec.businessName} is already written.`,
          "Implement ONLY these custom gaps with computer.files.* tools:",
          ...gaps.map((g) => `- ${g}`),
        ].join("\n"),
        allowTools: true,
        allowedToolNames: allowedTools,
        modelMode: "coding",
        toolContext: [
          formatToolsForPrompt(allowedTools),
          BUILD_PROJECT_INSTRUCTIONS,
          `Active projectId: ${projectId}`,
          `workspaceId: ${workspaceId}`,
          "Do not rewrite the whole site. Only address the listed gaps.",
        ].join("\n\n"),
      };
      // Run a short coding pass by falling through via recursive-ish loop:
      // mutate request path by executing one coding loop inline below.
      const coding = await runCodingAgentLoop(gapRequest, opts, {
        projectId,
        workspaceId,
        allowedTools,
        priorResults: toolResults,
      });
      toolResults.push(...(coding.toolResults ?? []));
      gapNote = coding.content
        ? `\n\nCustom gaps: ${gaps.join("; ")}.\n${coding.content}`
        : `\n\nCustom gaps noted for later: ${gaps.join("; ")}.`;
    }

    return {
      content: [
        `Created a production-ready draft site for **${spec.businessName}** (${okWrites} files) from a structured design plan, saved in one GitHub draft commit.`,
        "Preview stays on your draft URL — use Reload if it’s still warming up.",
        failed.length
          ? `Some writes failed: ${failed.map((f) => f.output).join("; ")}`
          : "",
        gapNote,
      ]
        .filter(Boolean)
        .join("\n\n"),
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
      toolResults,
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
    modelMode: "coding",
    toolContext: [
      formatToolsForPrompt(allowedTools),
      BUILD_PROJECT_INSTRUCTIONS,
      `Active projectId: ${projectId}`,
      `workspaceId: ${workspaceId}`,
      "Implement the user's request with computer.files.* tools now. No code dumps in chat.",
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
        (isBuildIntent(request.content) || looksLikeCodeDump(visible));

      if (needsForce) {
        forcedToolRetry = true;
        working = {
          ...working,
          modelMode: "coding",
          toolContext: [
            formatToolsForPrompt(allowedTools),
            BUILD_PROJECT_INSTRUCTIONS,
            formatToolResultsNote(toolResults),
            "CRITICAL: Do not paste code in chat. Call computer.files.write now for package.json, app/layout.js, and app/page.js.",
          ].join("\n\n"),
          content: [
            request.content,
            "",
            "Write the Next.js files with computer.files.write. No code-only replies.",
          ].join("\n"),
        };
        continue;
      }

      // Still dumped code with no writes — fall back to SiteSpec compose.
      if (writes === 0 && looksLikeCodeDump(visible)) {
        report({
          phase: "thinking",
          label: "Building",
          detail: "Composing site files into the sandbox instead of chatting code…",
        });
        const spec = await planWebsite(request, opts);
        const files = composeSiteFromSpec(spec);
        const written = await writeScaffold({
          projectId,
          workspaceId,
          files,
          report,
        });
        toolResults.push(...written);
        const okWrites = written.filter(
          (r) => r.name === "computer.files.write" && r.ok,
        ).length;
        if (okWrites > 0) {
          await ensureSandboxReady({
            projectId,
            workspaceId,
            forceRestart: false,
          });
        }
        return {
          content:
            okWrites > 0
              ? `Created a draft site for **${spec.businessName}** (${okWrites} files) and saved it to GitHub. Reload Preview if blank.`
              : written.find((r) => !r.ok)?.output ||
                "Couldn’t write files. Try again.",
          runtime: "cloud",
          offline: false,
          condensationOccurred: false,
          aiChatId: request.aiChatId ?? null,
          toolResults,
        };
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
      modelMode: "coding",
      toolContext: [
        formatToolsForPrompt(allowedTools),
        BUILD_PROJECT_INSTRUCTIONS,
        formatToolResultsNote(toolResults),
        "Continue with more file writes if needed, then a short user summary — no code dumps.",
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
    try {
      await ensureSandboxReady({ projectId, workspaceId, forceRestart: false });
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
