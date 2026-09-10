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
import { isPlanFirstBuildEnabled } from "@/lib/ai/build/plan/flag";
import { buildProjectSpecFromBrief } from "@/lib/ai/build/plan/project-spec";
import { generateBuildPlan } from "@/lib/ai/build/plan/generate-plan";
import { savePlanFirstArtifacts } from "@/lib/ai/build/plan/store";
import type { ScaffoldFile } from "@/lib/ai/build/site-spec";
import {
  briefToPlanningPrompt,
  isWebsiteSetupComplete,
  mergeAnswersIntoBrief,
  WEBSITE_SETUP_RESUME_TOOL,
  type WebsiteSetupBrief,
} from "@/lib/ai/build/website-setup-brief";
import { validateWebsiteFiles } from "@/lib/ai/build/website-validate";
import {
  mergeValidationIntoManifest,
  validatePlanFirstTip,
  visualQaChecklist,
} from "@/lib/ai/build/validate/plan-first";
import {
  formatRetrievedComponentsForCodex,
  retrievedComponentsToScaffoldFiles,
  setActiveTwentyFirstClient,
} from "@/lib/ai/build/twenty-first-mcp";
import { retrieveTwentyFirstForSiteSpecClient, retrieveTwentyFirstForBuildPlanClient } from "@/lib/api/twenty-first-client";
import {
  getProjectKindForSetup,
  loadWebsiteSetupBrief,
  saveWebsiteSetupBrief,
} from "@/lib/build/website-setup-brief-store";
import type { BuildPlanRecord } from "@/lib/ai/build/plan/types";

const MAX_ROUNDS = 10;

const PLAN_INTENT_RE =
  /\b(plan|planning|brainstorm|outline|theme|themes|mood\s*board|wireframe|sitemap|ia\b|information\s*architecture|what\s+should|help\s+me\s+(decide|figure)|before\s+we\s+build|don'?t\s+build\s+yet|just\s+plan)\b/i;

const IMPLEMENT_INTENT_RE =
  /\b(implement|build\s+it|create\s+it|scaffold|ship\s+it|go\s+ahead|make\s+it|write\s+the\s+code|start\s+coding|let'?s\s+build|do\s+it|run\s+supabase|set\s+up\s+supabase|build\s+my\s+site|website\.build_from_setup)\b/i;

const GUIDED_SETUP_CONFIRM_RE =
  /website\.build_from_setup|Build my site|Ready to build|confirm_build|Guided website setup brief/i;

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
- Call tools as JSON: {"tool":"computer.files.write","arguments":{"path":"app/page.tsx","content":"..."}}
- Supabase / databases: only when the user asks or the plan clearly needs them — use build.* tools when available.

Workflow for "create a website/app":
1. computer.files.list to see current files (optional).
2. computer.files.write for package.json, next.config.mjs, app/layout.tsx, app/page.tsx, app/robots.ts, app/sitemap.ts, .gitignore.
3. Prefer TypeScript/TSX App Router files. Never leave both app/page.js and app/page.tsx (or any sibling extension) for the same route.
4. Summarize briefly.`;

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
  /** Explicit deletes (legacy competing routes). Auto-derived when omitted. */
  deletePaths?: string[];
  report: NonNullable<AgentTurnOptions["onProgress"]>;
}): Promise<AiToolCallResult[]> {
  const results: AiToolCallResult[] = [];
  if (opts.files.length === 0 && !(opts.deletePaths?.length ?? 0)) return results;

  const { deletePathsForPreferredWrites } = await import(
    "@/lib/ai/build/routes/app-router-conflicts"
  );
  const deletePaths = [
    ...new Set([
      ...(opts.deletePaths ?? []),
      ...deletePathsForPreferredWrites(opts.files),
    ]),
  ];

  // Git-first only — never treat sandbox writes as success for create/scaffold.
  // Empty-repo chicken-and-egg: sandbox cannot be "ready" without package.json.
  opts.report({
    phase: "tool",
    label: "Building",
    detail: `Saving ${opts.files.length} files to draft…`,
    toolName: "computer.files.persist",
    contentStreaming: true,
  });
  try {
    const { commitProjectDraftFilesClient } = await import(
      "@/lib/api/project-git-client"
    );
    const committed = await commitProjectDraftFilesClient({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      files: opts.files,
      deletePaths,
      message: `Cander: write ${opts.files.length} scaffold files`,
    });
    if (committed?.ok) {
      for (const file of opts.files) {
        results.push({
          name: "computer.files.write",
          ok: true,
          output: `Wrote ${file.path} → draft ${committed.draftSha?.slice(0, 7) || ""}`,
        });
      }
      for (const path of deletePaths) {
        results.push({
          name: "computer.files.write",
          ok: true,
          output: `Removed conflicting route ${path}`,
        });
      }
      results.push({
        name: "computer.files.persist",
        ok: true,
        output: `Persisted ${committed.filesCommitted ?? opts.files.length} files`,
      });
      opts.report({
        phase: "follow_up",
        label: "Building",
        detail: `Saved ${opts.files.length} files to GitHub draft…`,
        toolName: "computer.files.persist",
        toolOk: true,
        contentStreaming: true,
      });
      return results;
    }
    const errMsg = committed?.error || "Git draft persist failed.";
    console.warn("[cander:build] git scaffold persist failed (no sandbox fallback)", errMsg);
    results.push({
      name: "computer.files.persist",
      ok: false,
      output: errMsg,
    });
    opts.report({
      phase: "follow_up",
      label: "Building",
      detail: errMsg,
      toolName: "computer.files.persist",
      toolOk: false,
      contentStreaming: true,
    });
    return results;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn("[cander:build] git scaffold persist threw (no sandbox fallback)", err);
    results.push({
      name: "computer.files.persist",
      ok: false,
      output: errMsg,
    });
    opts.report({
      phase: "follow_up",
      label: "Building",
      detail: errMsg,
      toolName: "computer.files.persist",
      toolOk: false,
      contentStreaming: true,
    });
    return results;
  }
}

async function runPlanFirstCreatePipeline(
  opts: Omit<Parameters<typeof runCreateWebsitePipeline>[0], "planFirst">,
): Promise<AgentTurnResult> {
  return runCreateWebsitePipeline({ ...opts, planFirst: true });
}

/** Legacy create when `CANDER_BUILD_PLAN_FIRST` / `NEXT_PUBLIC_…` is off. */
async function runWebsiteCreatePipeline(
  opts: Omit<Parameters<typeof runCreateWebsitePipeline>[0], "planFirst">,
): Promise<AgentTurnResult> {
  return runCreateWebsitePipeline({ ...opts, planFirst: false });
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

function parseSetupAnswersFromContent(
  content: string,
): Record<string, unknown> | null {
  const answers: Record<string, unknown> = {};
  const lines = content.split("\n");
  for (const line of lines) {
    const m = line.match(/^-\s*([^:]+):\s*(.+)$/);
    if (!m) continue;
    const label = m[1]!.trim().toLowerCase();
    const value = m[2]!.trim();
    if (label.includes("business")) answers.business_goal = value;
    else if (label.includes("audience")) answers.audience_cta = value;
    else if (label.includes("depth")) answers.site_depth = value;
    else if (label.includes("visual")) answers.visual_style = value;
    else if (label.includes("color")) answers.brand_colors = value;
    else if (label.includes("layout")) {
      answers.layout_shape = value.includes(",")
        ? value.split(",").map((s) => s.trim())
        : value;
    } else if (label.includes("copy") || label.includes("tone")) {
      answers.copy_tone = value;
    } else if (label.includes("section") || label.includes("feature")) {
      answers.sections_features = value.includes(",")
        ? value.split(",").map((s) => s.trim())
        : value;
    }
  }
  // Also catch JSON-ish clarification dumps: `- business_goal: "..."`
  for (const key of [
    "business_goal",
    "audience_cta",
    "site_depth",
    "visual_style",
    "brand_colors",
    "layout_shape",
    "copy_tone",
    "sections_features",
    "confirm_build",
  ]) {
    const re = new RegExp(`${key}["']?\\s*[:=]\\s*["']?([^"'\\n]+)`, "i");
    const hit = content.match(re);
    if (hit?.[1] && !(key in answers)) {
      answers[key] = hit[1].trim();
    }
  }
  return Object.keys(answers).length ? answers : null;
}

async function runCreateWebsitePipeline(opts: {
  request: AiGenerateRequest;
  opts?: AgentTurnOptions;
  projectId: string;
  workspaceId: string;
  allowedTools: string[];
  toolResults: AiToolCallResult[];
  websiteBrief: WebsiteSetupBrief | null;
  isSiteProject: boolean;
  report: NonNullable<AgentTurnOptions["onProgress"]>;
  /** When true, plan artifacts are required — no silent legacy fallback. */
  planFirst: boolean;
}): Promise<AgentTurnResult> {
  const {
    request,
    opts: turnOpts,
    projectId,
    workspaceId,
    allowedTools,
    toolResults,
    isSiteProject,
    report,
    planFirst,
  } = opts;
  let brief = opts.websiteBrief;

  if (isSiteProject && brief) {
    brief = {
      ...brief,
      status: "building",
      updatedAt: new Date().toISOString(),
    };
    await saveWebsiteSetupBrief({ projectId, workspaceId, brief });
  }

  report({
    phase: "thinking",
    label: "Building",
    detail: "Planning site design from your brief…",
  });

  // Persist ProjectSpec + private BuildPlan before retrieval (required when planFirst).
  let activeBuildPlan: BuildPlanRecord | null = null;
  if (planFirst) {
    report({
      phase: "thinking",
      label: "Building",
      detail: "Writing product spec and build plan…",
    });
    try {
      const projectSpec = await buildProjectSpecFromBrief(
        request,
        brief,
        turnOpts,
      );
      activeBuildPlan = await generateBuildPlan(request, projectSpec, turnOpts);
      await savePlanFirstArtifacts({
        projectId,
        workspaceId,
        projectSpec,
        buildPlan: activeBuildPlan,
      });
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : "Plan-first persist failed.";
      console.error("[cander:plan] plan-first persist failed", err);
      if (brief) {
        await saveWebsiteSetupBrief({
          projectId,
          workspaceId,
          brief: {
            ...brief,
            status: "failed",
            validationIssues: [`Plan-first create failed: ${detail}`],
            updatedAt: new Date().toISOString(),
          },
        });
      }
      return {
        content: [
          "Could not start plan-first website creation — preview stays locked.",
          detail,
          "Fix the plan pipeline and try again.",
        ].join("\n"),
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
      };
    }
    if (!activeBuildPlan?.json) {
      if (brief) {
        await saveWebsiteSetupBrief({
          projectId,
          workspaceId,
          brief: {
            ...brief,
            status: "failed",
            validationIssues: [
              "Build plan was empty after plan-first generate.",
            ],
            updatedAt: new Date().toISOString(),
          },
        });
      }
      return {
        content:
          "Plan-first create produced an empty build plan. Preview stays locked until this is fixed.",
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
      };
    }
  }

  const planRequest: AiGenerateRequest = {
    ...request,
    content: [
      brief ? briefToPlanningPrompt(brief) : "",
      "",
      request.content,
    ]
      .filter(Boolean)
      .join("\n"),
  };
  const spec = await planWebsite(planRequest, turnOpts);

  report({
    phase: "thinking",
    label: "Building",
    detail: "Retrieving matching components from 21st.dev…",
  });

  let retrieved =
    brief?.retrievedComponents?.length ? brief.retrievedComponents : [];
  let usedTwentyFirstFallback = true;
  let twentyFirstMeta = {
    connected: false,
    tools: [] as string[],
  };
  try {
    // Build turn runs in the browser — MCP must go through the server API
    // so API_KEY_21ST never ships to the client.
    if (planFirst && activeBuildPlan?.json) {
      const retrieval = await retrieveTwentyFirstForBuildPlanClient({
        workspaceId,
        projectId,
        buildPlan: activeBuildPlan.json,
      });
      retrieved = retrieval.components;
      usedTwentyFirstFallback = retrieval.usedFallback;
      twentyFirstMeta = {
        connected: retrieval.connected,
        tools: retrieval.toolsDiscovered,
      };
      if (retrieval.researchManifest) {
        await savePlanFirstArtifacts({
          projectId,
          workspaceId,
          researchManifest: retrieval.researchManifest,
        });
      }
      console.info("[cander:21st-mcp] plan-first retrieval", {
        connected: retrieval.connected,
        selected: retrieved.map((c) => `${c.category}:${c.id}`),
        usedFallback: retrieval.usedFallback,
        error: retrieval.error,
      });
    } else {
      const retrieval = await retrieveTwentyFirstForSiteSpecClient({
        workspaceId,
        projectId,
        spec,
      });
      retrieved = retrieval.components;
      usedTwentyFirstFallback = retrieval.usedFallback;
      twentyFirstMeta = {
        connected: retrieval.connected,
        tools: retrieval.toolsDiscovered,
      };
      console.info("[cander:21st-mcp] pipeline retrieval", {
        connected: retrieval.connected,
        tools: retrieval.toolsDiscovered,
        selected: retrieved.map((c) => `${c.category}:${c.id}`),
        withCode: retrieved.filter((c) => c.codeSnippet?.trim()).length,
        usedFallback: retrieval.usedFallback,
        error: retrieval.error,
      });
    }
  } catch (err) {
    console.warn("[cander:21st-mcp] retrieve failed; catalog fallback", err);
    usedTwentyFirstFallback = true;
  }

  if (brief) {
    brief = {
      ...brief,
      siteSpec: spec,
      retrievedComponents: retrieved,
      status: "building",
      updatedAt: new Date().toISOString(),
    };
    await saveWebsiteSetupBrief({ projectId, workspaceId, brief });
  }

  let files = composeSiteFromSpec(spec);
  let usedCodex = false;
  let hasUsableTwentyFirst = retrieved.some((c) => c.codeSnippet?.trim());
  let usedTwentyFirstFallbackAfterNormalize = usedTwentyFirstFallback;

  // 21st search → fetch → analyze → resolve/install → normalize → validate
  // → only then expose clean components to Codex.
  let normalizedFiles: { path: string; content: string }[] = [];
  let normalizedPackageDeps: Record<string, string> = {};
  if (hasUsableTwentyFirst) {
    report({
      phase: "thinking",
      label: "Building",
      detail: "Analyzing 21st.dev dependencies and installing support files…",
    });
    const {
      normalizeTwentyFirstPipeline,
      normalizedToRetrievedRefs,
    } = await import("@/lib/ai/build/twenty-first/pipeline");
    const globalsFile = files.find((f) => f.path === "app/globals.css");
    const normalized = normalizeTwentyFirstPipeline({
      components: retrieved,
      existingGlobalsCss: globalsFile?.content ?? null,
    });
    for (const line of normalized.logs) {
      console.info("[cander:21st-normalize]", line);
    }
    if (normalized.fallbackToCatalog || !normalized.ok) {
      usedTwentyFirstFallbackAfterNormalize = true;
      hasUsableTwentyFirst = false;
      retrieved = [];
      report({
        phase: "thinking",
        label: "Building",
        detail:
          "21st components could not be normalized — using Cander catalog…",
      });
    } else {
      retrieved = normalizedToRetrievedRefs(normalized.components);
      normalizedFiles = normalized.files;
      normalizedPackageDeps = normalized.packageDependencies;
      usedTwentyFirstFallbackAfterNormalize = false;
      hasUsableTwentyFirst = retrieved.length > 0;

      // Persist package.json + support + normalized vendor BEFORE Codex.
      const { ensureNextInPackageJson, canonicalSitePackageJson } =
        await import("@/lib/ai/build/site-package");
      const basePkg = canonicalSitePackageJson({ name: "cander-site" });
      const mergedDeps = {
        ...((basePkg.dependencies as Record<string, string>) || {}),
        ...normalizedPackageDeps,
      };
      const pkgJson = ensureNextInPackageJson(
        JSON.stringify({ ...basePkg, dependencies: mergedDeps }),
        { name: "cander-site" },
      );
      const installFiles = [
        { path: "package.json", content: pkgJson },
        ...normalizedFiles.filter((f) => f.path !== "package.json"),
      ];
      // Deduplicate by path (last wins)
      const byPath = new Map<string, { path: string; content: string }>();
      for (const f of installFiles) byPath.set(f.path, f);
      const toWrite = [...byPath.values()];
      report({
        phase: "thinking",
        label: "Building",
        detail: `Installing ${Object.keys(normalizedPackageDeps).length} packages and ${toWrite.length} support files…`,
      });
      const written = await writeScaffold({
        projectId,
        workspaceId,
        files: toWrite,
        report,
      });
      toolResults.push(...written);

      if (planFirst) {
        await savePlanFirstArtifacts({
          projectId,
          workspaceId,
          implementationManifest: {
            version: 1,
            files: toWrite.map((f) => ({ path: f.path })),
            routes: (activeBuildPlan?.json.sitemap ?? spec.pages).map((p) => ({
              path: "path" in p ? p.path : "/",
              pageId: "id" in p ? p.id : undefined,
            })),
            tasks: ["normalize-twenty-first", "git-scaffold"],
            validation: { ok: false, technical: [], visual: [] },
            packageJson: { dependencies: mergedDeps },
          },
        });
      }

      // Force sandbox recreate so npm install sees the new package.json.
      await ensureSandboxReady({ projectId, workspaceId, forceRestart: true });
    }

    if (brief) {
      brief = {
        ...brief,
        retrievedComponents: retrieved,
        updatedAt: new Date().toISOString(),
      };
      await saveWebsiteSetupBrief({ projectId, workspaceId, brief });
    }
  }

  const vendorFiles = retrievedComponentsToScaffoldFiles(retrieved);

  if (hasUsableTwentyFirst) {
    report({
      phase: "thinking",
      label: "Building",
      detail: "Codex adapting normalized 21st components into the site…",
    });
    // Vendor already written during normalize; Codex adapts into pages.
    const composeRequest: AiGenerateRequest = {
      ...request,
      content: [
        "Compose this marketing site in the sandbox using computer.files.* tools.",
        "CRITICAL: Adapt the retrieved 21st.dev components below into App Router pages.",
        "Do NOT invent a minimal placeholder scaffold when 21st source is provided.",
        "Import/adapt files under components/twenty-first/*; keep SiteSpec copy, CTAs, nav, SEO.",
        "Dependencies and UI primitives are already installed — do not invent missing modules.",
        "You may call build.component.search / build.component.get only if a section is missing (cached).",
        briefToPlanningPrompt(
          brief ?? {
            status: "building",
            completedSteps: 8,
            answers: {},
            updatedAt: new Date().toISOString(),
          },
        ),
        "",
        `SiteSpec JSON:\n${JSON.stringify(spec).slice(0, 12000)}`,
        "",
        "Normalized 21st.dev components (ready to import):",
        formatRetrievedComponentsForCodex(retrieved),
      ].join("\n"),
      allowTools: true,
      allowedToolNames: [
        ...allowedTools,
        "build.component.search",
        "build.component.get",
      ],
      modelMode: "coding",
      toolContext: [
        formatToolsForPrompt([
          ...allowedTools,
          "build.component.search",
          "build.component.get",
        ]),
        BUILD_PROJECT_INSTRUCTIONS,
        `Active projectId: ${projectId}`,
        `workspaceId: ${workspaceId}`,
        "21st MCP tools are available as build.component.search and build.component.get (server-side, cached).",
        "Write Next.js App Router files. Include header, footer, mobile nav, metadata, robots, sitemap.",
        "Leave a short comment near adapted sections: /* 21st: <id> */ so we can verify provenance.",
        "package.json, lib/utils, and components/ui/* are already present — reuse them.",
      ].join("\n\n"),
    };
    const coding = await runCodingAgentLoop(composeRequest, turnOpts, {
      projectId,
      workspaceId,
      allowedTools: [
        ...allowedTools,
        "build.component.search",
        "build.component.get",
      ],
      priorResults: toolResults,
    });
    toolResults.push(...(coding.toolResults ?? []));
    usedCodex = (coding.toolResults ?? []).some(
      (r) => r.name === "computer.files.write" && r.ok,
    );
  }

  if (!usedCodex) {
    console.info("[cander:21st-mcp] compose path", {
      reason: hasUsableTwentyFirst
        ? "codex produced no writes — merging catalog scaffold + vendor files"
        : usedTwentyFirstFallbackAfterNormalize
          ? "21st empty/unavailable/unnormalizable — Cander catalog fallback"
          : "no 21st code snippets — catalog scaffold",
      connected: twentyFirstMeta.connected,
      tools: twentyFirstMeta.tools,
    });
    report({
      phase: "thinking",
      label: "Building",
      detail: hasUsableTwentyFirst
        ? "Merging catalog shell with normalized 21st vendor files…"
        : "Composing site files from the Cander design system…",
    });
    const merged = hasUsableTwentyFirst
      ? [...vendorFiles, ...files]
      : files;
    const written = await writeScaffold({
      projectId,
      workspaceId,
      files: merged,
      report,
    });
    toolResults.push(...written);
  }

  // Clear MCP client after generation so the next turn does not reuse stale cache across projects.
  setActiveTwentyFirstClient(null);

  const okWrites = toolResults.filter(
    (r) => r.name === "computer.files.write" && r.ok,
  ).length;
  if (okWrites === 0) {
    if (brief) {
      await saveWebsiteSetupBrief({
        projectId,
        workspaceId,
        brief: { ...brief, status: "failed", updatedAt: new Date().toISOString() },
      });
    }
    return {
      content: "I couldn’t write files into the sandbox. Try confirming build again.",
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
      toolResults,
    };
  }

  // Re-compose files for validation when Codex wrote (best-effort from Spec + vendor).
  if (usedCodex) {
    files = [...vendorFiles, ...composeSiteFromSpec(spec)];
  } else if (hasUsableTwentyFirst) {
    files = [...vendorFiles, ...composeSiteFromSpec(spec)];
  }

  report({
    phase: "thinking",
    label: "Building",
    detail: "Validating pages, nav, SEO, and forms…",
  });
  {
    const { repairSeoConsistencyFiles } = await import(
      "@/lib/ai/build/seo-consistency"
    );
    const seoEarly = repairSeoConsistencyFiles({ files, spec });
    if (seoEarly.repaired) {
      files = seoEarly.files;
    }
  }
  let validation = planFirst
    ? validatePlanFirstTip({
        files,
        spec,
        plan: activeBuildPlan?.json,
      })
    : validateWebsiteFiles({ files, spec });
  if (!validation.ok && usedCodex === false) {
    // Deterministic compose should usually pass; still report.
  }

  if (!validation.ok) {
    report({
      phase: "thinking",
      label: "Building",
      detail: "Repairing validation issues…",
    });
    const repairRequest: AiGenerateRequest = {
      ...request,
      content: [
        `Fix these website validation issues with computer.files.* tools:`,
        ...validation.issues.map((i) => `- ${i}`),
        "",
        `SiteSpec: ${JSON.stringify(spec).slice(0, 8000)}`,
      ].join("\n"),
      allowTools: true,
      allowedToolNames: allowedTools,
      modelMode: "coding",
      toolContext: [
        formatToolsForPrompt(allowedTools),
        BUILD_PROJECT_INSTRUCTIONS,
        `Active projectId: ${projectId}`,
        `workspaceId: ${workspaceId}`,
      ].join("\n\n"),
    };
    const repair = await runCodingAgentLoop(repairRequest, turnOpts, {
      projectId,
      workspaceId,
      allowedTools,
      priorResults: toolResults,
    });
    toolResults.push(...(repair.toolResults ?? []));
    // Re-validate against composed Spec files (proxy for structure).
    validation = planFirst
      ? validatePlanFirstTip({
          files: composeSiteFromSpec(spec),
          spec,
          plan: activeBuildPlan?.json,
        })
      : validateWebsiteFiles({ files: composeSiteFromSpec(spec), spec });
  }

  if (!validation.ok) {
    if (planFirst) {
      await savePlanFirstArtifacts({
        projectId,
        workspaceId,
        implementationManifest: mergeValidationIntoManifest(
          {
            version: 1,
            files: files.map((f) => ({ path: f.path })),
            routes: (activeBuildPlan?.json.sitemap ?? spec.pages).map((p) => ({
              path: "path" in p ? p.path : "/",
              pageId: "id" in p ? p.id : undefined,
            })),
            tasks: ["validate"],
            validation: { ok: false, technical: validation.issues, visual: [] },
          },
          validation.issues,
          [],
        ),
      });
    }
    if (brief) {
      await saveWebsiteSetupBrief({
        projectId,
        workspaceId,
        brief: {
          ...brief,
          status: "failed",
          validationIssues: validation.issues,
          updatedAt: new Date().toISOString(),
        },
      });
    }
    return {
      content: [
        "Draft files were written, but validation failed — preview stays blank until this is fixed:",
        ...validation.issues.map((i) => `- ${i}`),
        "",
        "Tell me to repair the site and I’ll take another pass.",
      ].join("\n"),
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
      toolResults,
    };
  }

  // Codex often writes layout/components but skips package.json / routes.
  // Always re-assert a runnable Next scaffold after a successful compose.
  {
    const { repairSeoConsistencyFiles } = await import(
      "@/lib/ai/build/seo-consistency"
    );
    const seoPass = repairSeoConsistencyFiles({ files, spec });
    if (seoPass.repaired) {
      files = seoPass.files;
      report({
        phase: "thinking",
        label: "Building",
        detail: "Repairing robots/sitemap SEO consistency…",
      });
    }

    const composed = composeSiteFromSpec(spec);
    const essentials = composed.filter((f) =>
      [
        "package.json",
        "next.config.mjs",
        ".gitignore",
        "app/robots.ts",
        "app/sitemap.ts",
        "app/globals.css",
        "app/page.tsx",
        "app/layout.tsx",
        "tsconfig.json",
        "lib/utils.ts",
      ].includes(f.path) || f.path.startsWith("components/ui/"),
    );
    const { ensureNextInPackageJson } = await import(
      "@/lib/ai/build/site-package"
    );
    let toWrite = essentials.map((f) => {
      if (f.path !== "package.json") return f;
      let content = f.content;
      if (Object.keys(normalizedPackageDeps).length) {
        try {
          const pkg = JSON.parse(content) as {
            dependencies?: Record<string, string>;
          };
          pkg.dependencies = {
            ...(pkg.dependencies ?? {}),
            ...normalizedPackageDeps,
          };
          content = `${JSON.stringify(pkg, null, 2)}\n`;
        } catch {
          /* keep */
        }
      }
      return {
        ...f,
        content: ensureNextInPackageJson(content, { name: "cander-site" }),
      };
    });
    // Prefer SEO-repaired robots/sitemap over compose defaults when present.
    for (const p of ["app/robots.ts", "app/sitemap.ts"] as const) {
      const fixed = files.find((f) => f.path === p);
      if (fixed) {
        toWrite = [...toWrite.filter((f) => f.path !== p), fixed];
      }
    }
    // Final SEO pass on the exact write set.
    {
      const merged = repairSeoConsistencyFiles({
        files: [
          ...files.filter((f) => !toWrite.some((w) => w.path === f.path)),
          ...toWrite,
        ],
        spec,
      });
      files = merged.files;
      for (const p of ["app/robots.ts", "app/sitemap.ts"] as const) {
        const fixed = merged.files.find((f) => f.path === p);
        if (fixed) {
          toWrite = [...toWrite.filter((f) => f.path !== p), fixed];
        }
      }
    }
    report({
      phase: "thinking",
      label: "Building",
      detail: "Ensuring Next.js package and core site files…",
    });
    const ensured = await writeScaffold({
      projectId,
      workspaceId,
      files: toWrite,
      report,
    });
    toolResults.push(...ensured);
    // Essentials are canonical — merge into the file list used for the manifest.
    {
      const byPath = new Map(files.map((f) => [f.path, f]));
      for (const f of toWrite) byPath.set(f.path, f);
      files = [...byPath.values()];
    }
    const essentialsOk = ensured.some(
      (r) => r.name === "computer.files.persist" && r.ok,
    );
    if (!essentialsOk) {
      if (brief) {
        await saveWebsiteSetupBrief({
          projectId,
          workspaceId,
          brief: {
            ...brief,
            status: "failed",
            validationIssues: [
              "Could not save the Next.js scaffold to the GitHub draft tip.",
            ],
            updatedAt: new Date().toISOString(),
          },
        });
      }
      return {
        content: [
          "Could not write the runnable scaffold into the draft repository.",
          "Preview stays locked until package.json lands on the draft tip.",
          "Try again in a moment, or ask me to repair the draft.",
        ].join("\n"),
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
      };
    }
  }

  // Fail closed before sandbox boot if duplicate App Router files remain in the tip set.
  {
    const { duplicateAppRouterValidationIssues } = await import(
      "@/lib/ai/build/routes/app-router-conflicts"
    );
    const dupIssues = duplicateAppRouterValidationIssues(
      files.map((f) => f.path),
    );
    if (dupIssues.length) {
      if (planFirst) {
        await savePlanFirstArtifacts({
          projectId,
          workspaceId,
          implementationManifest: mergeValidationIntoManifest(
            {
              version: 1,
              files: files.map((f) => ({ path: f.path })),
              routes: (activeBuildPlan?.json.sitemap ?? spec.pages).map((p) => ({
                path: "path" in p ? p.path : "/",
                pageId: "id" in p ? p.id : undefined,
              })),
              tasks: ["route-conflict-check"],
              validation: {
                ok: false,
                technical: dupIssues,
                visual: [],
              },
            },
            dupIssues,
            [],
          ),
        });
      }
      if (brief) {
        await saveWebsiteSetupBrief({
          projectId,
          workspaceId,
          brief: {
            ...brief,
            status: "failed",
            validationIssues: dupIssues,
            updatedAt: new Date().toISOString(),
          },
        });
      }
      return {
        content: [
          "Draft failed to start — duplicate App Router files must be removed before preview:",
          ...dupIssues.map((i) => `- ${i}`),
        ].join("\n"),
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
      };
    }
  }

  // Fail closed if SEO artifacts still disagree after deterministic repair.
  {
    const { seoConsistencyIssues } = await import(
      "@/lib/ai/build/seo-consistency"
    );
    const robots = files.find((f) => f.path.startsWith("app/robots."));
    const layout = files.find((f) => /^app\/layout\.(tsx|ts|jsx|js)$/.test(f.path));
    const seoIssues = seoConsistencyIssues({
      paths: files.map((f) => f.path),
      robotsContent: robots?.content ?? null,
      layoutContent: layout?.content ?? null,
      requireBoth: true,
    });
    if (seoIssues.length) {
      if (brief) {
        await saveWebsiteSetupBrief({
          projectId,
          workspaceId,
          brief: {
            ...brief,
            status: "failed",
            validationIssues: seoIssues,
            updatedAt: new Date().toISOString(),
          },
        });
      }
      return {
        content: [
          "Draft failed to start — SEO metadata is inconsistent (robots/sitemap):",
          ...seoIssues.map((i) => `- ${i}`),
          "",
          "Tell me to repair the site and I’ll fix robots/sitemap, then retry.",
        ].join("\n"),
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
      };
    }
  }

  // Phase 3: tip is complete — boot sandbox, then server preview_check → ready.
  // Client cannot mark ready; only /api/.../build/ready after SHA pin + health.
  if (brief) {
    await saveWebsiteSetupBrief({
      projectId,
      workspaceId,
      brief: {
        ...brief,
        status: "building",
        siteSpec: spec,
        retrievedComponents: retrieved,
        validationIssues: [],
        updatedAt: new Date().toISOString(),
      },
    });
  }

  report({
    phase: "thinking",
    label: "Building",
    detail: "Booting draft preview…",
  });
  const sandboxBoot = await ensureSandboxReady({
    projectId,
    workspaceId,
    forceRestart: true,
  });
  if (!sandboxBoot.ok) {
    if (brief) {
      await saveWebsiteSetupBrief({
        projectId,
        workspaceId,
        brief: {
          ...brief,
          status: "failed",
          siteSpec: spec,
          retrievedComponents: retrieved,
          validationIssues: [
            sandboxBoot.detail || "Sandbox failed to boot after tip write.",
          ],
          updatedAt: new Date().toISOString(),
        },
      });
    }
    return {
      content: [
        `Draft files were saved, but the preview environment failed to start: ${sandboxBoot.detail}`,
        "Tell me to retry the preview boot — I won’t mark the site ready until it passes.",
      ].join("\n"),
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
    detail: "Checking draft preview health…",
  });
  {
    const { requestBuildReadyClient } = await import(
      "@/lib/api/build-ready-client"
    );
    const finalized = await requestBuildReadyClient({
      projectId,
      workspaceId,
    });
    if (!finalized?.ok) {
      const reason =
        finalized?.reason ||
        finalized?.error ||
        "Preview health check failed.";
      if (brief) {
        await saveWebsiteSetupBrief({
          projectId,
          workspaceId,
          brief: {
            ...brief,
            status: "failed",
            siteSpec: spec,
            retrievedComponents: retrieved,
            validationIssues: [reason],
            updatedAt: new Date().toISOString(),
          },
        });
      }
      return {
        content: [
          `Draft was written, but preview check failed before ready: ${reason}`,
          "Tell me to repair the site and I’ll fix it, then re-check preview.",
        ].join("\n"),
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
      };
    }
  }

  if (planFirst) {
    await savePlanFirstArtifacts({
      projectId,
      workspaceId,
      implementationManifest: {
        version: 1,
        files: files.map((f) => ({ path: f.path })),
        routes: (activeBuildPlan?.json.sitemap ?? spec.pages).map((p) => ({
          path: "path" in p ? p.path : "/",
          pageId: "id" in p ? p.id : undefined,
        })),
        tasks: [
          "compose",
          "validate",
          "ensure-essentials",
          "sandbox",
          "preview_check",
        ],
        validation: { ok: true, technical: [], visual: [] },
        updatedAt: new Date().toISOString(),
      },
    });
    // visualQaChecklist() documents desktop/tablet/mobile expectations for
    // the next Codex visual repair pass (budget: BUILD_RETRY_BUDGETS.codexVisualRepair).
    void visualQaChecklist;
  }

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
    const coding = await runCodingAgentLoop(gapRequest, turnOpts, {
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
      `Created a production-ready draft site for **${spec.businessName}** (${okWrites} files)${
        hasUsableTwentyFirst
          ? ` using ${retrieved.filter((c) => c.codeSnippet?.trim()).length} 21st.dev MCP component${
              retrieved.filter((c) => c.codeSnippet?.trim()).length === 1
                ? ""
                : "s"
            }`
          : usedTwentyFirstFallbackAfterNormalize
            ? " from the Cander design system (21st MCP unavailable, empty, or failed normalize — fallback)"
            : " from the design system"
      }, validated, and saved to GitHub.`,
      "Preview should unlock on your draft URL — use Reload if it’s still warming up.",
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

  const projectKind =
    (request.projectKind || "").trim().toLowerCase() ||
    (await getProjectKindForSetup(projectId, workspaceId)) ||
    "";
  const isSiteProject = projectKind === "site";

  let websiteBrief: WebsiteSetupBrief | null = null;
  if (isSiteProject) {
    websiteBrief = await loadWebsiteSetupBrief(projectId, workspaceId);
    // Merge clarification answers embedded in the resume message when present.
    if (
      GUIDED_SETUP_CONFIRM_RE.test(request.content) ||
      request.content.includes(WEBSITE_SETUP_RESUME_TOOL)
    ) {
      const parsed = parseSetupAnswersFromContent(request.content);
      if (parsed) {
        websiteBrief = mergeAnswersIntoBrief(websiteBrief, parsed);
        websiteBrief = {
          ...websiteBrief,
          answers: {
            ...websiteBrief.answers,
            confirm_build: true,
          },
          confirmedAt: websiteBrief.confirmedAt ?? new Date().toISOString(),
        };
        await saveWebsiteSetupBrief({
          projectId,
          workspaceId,
          brief: websiteBrief,
        });
      }
    }
  }

  const wantsCreate =
    isBuildCreateIntent(request.content) ||
    IMPLEMENT_INTENT_RE.test(request.content) ||
    GUIDED_SETUP_CONFIRM_RE.test(request.content);

  // Sites: block generation until guided setup is complete + confirmed.
  if (isSiteProject && wantsCreate && websiteBrief) {
    if (
      websiteBrief.status === "setup" &&
      !isWebsiteSetupComplete(websiteBrief)
    ) {
      return {
        content:
          "Finish the website setup questions above the composer (all 8 steps), then confirm **Build my site**. I won’t generate a draft until then — the preview stays blank with the progress ring.",
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
      };
    }
  }

  // Soft sandbox only after generation is allowed to start (sites past setup).
  const shouldStartSandbox =
    !isSiteProject ||
    !websiteBrief ||
    websiteBrief.status === "ready" ||
    websiteBrief.status === "building" ||
    (wantsCreate && isWebsiteSetupComplete(websiteBrief));

  if (!shouldStartSandbox && isSiteProject) {
    return {
      content:
        "Your website project is in guided setup. Answer the questions in the card above the composer — the preview stays blank until we build.",
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
    };
  }

  // Guided / create path — git-first: no sandbox until tip is complete.
  if (wantsCreate) {
    if (isSiteProject && websiteBrief) {
      await saveWebsiteSetupBrief({
        projectId,
        workspaceId,
        brief: {
          ...websiteBrief,
          status: "building",
          updatedAt: new Date().toISOString(),
        },
      });
    }
    report({
      phase: "thinking",
      label: "Building",
      detail: "Writing draft to GitHub first…",
    });
    if (isPlanFirstBuildEnabled()) {
      return runPlanFirstCreatePipeline({
        request,
        opts,
        projectId,
        workspaceId,
        allowedTools,
        toolResults,
        websiteBrief,
        isSiteProject,
        report,
      });
    }
    return runWebsiteCreatePipeline({
      request,
      opts,
      projectId,
      workspaceId,
      allowedTools,
      toolResults,
      websiteBrief,
      isSiteProject,
      report,
    });
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
            "CRITICAL: Do not paste code in chat. Call computer.files.write now for package.json, app/layout.tsx, and app/page.tsx. Prefer TSX; delete any competing app/page.js sibling.",
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
