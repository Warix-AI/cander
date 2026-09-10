/**
 * Phase 4 — conversational draft-only edit pipeline.
 * Inspect plan + tip → optional 21st → Codex minimal edit (persist:false) →
 * one draft commit → validate → SHA-pinned sandbox + ready.
 * Never publishes / never promotes production.
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
import { loadPlanFirstArtifacts, savePlanFirstArtifacts } from "@/lib/ai/build/plan/store";
import {
  formatRetrievedComponentsForCodex,
} from "@/lib/ai/build/twenty-first-mcp";
import { retrieveTwentyFirstForBuildPlanClient } from "@/lib/api/twenty-first-client";
import {
  inspectProjectDraftTipClient,
  persistProjectSandboxDraftClient,
} from "@/lib/api/project-git-client";
import { requestBuildReadyClient } from "@/lib/api/build-ready-client";
import type { WebsiteSetupBrief } from "@/lib/ai/build/website-setup-brief";
import { saveWebsiteSetupBrief } from "@/lib/build/website-setup-brief-store";
import { duplicateAppRouterValidationIssues } from "@/lib/ai/build/routes/app-router-conflicts";
import type { ScaffoldFile } from "@/lib/ai/build/site-spec";
import {
  editPathAllowsPublish,
  editToolNamesFromBuildDomain,
} from "@/lib/ai/build/edit-guards";

const EDIT_MAX_ROUNDS = 8;

/** Tools allowed on the edit path — never include build.publish. */
export function editToolNames(): string[] {
  return editToolNamesFromBuildDomain(TOOL_DOMAINS.build);
}

export { editPathAllowsPublish };

const STRUCTURAL_EDIT_RE =
  /\b(add|new|create|remove|delete|rename)\b[\s\S]{0,40}\b(page|section|nav|route|component|hero|footer|pricing|gallery)\b/i;

const WANTS_21ST_RE =
  /\b(21st|component|hero|gallery|carousel|testimonial|pricing\s+card|navbar|footer)\b/i;

const EDIT_INSTRUCTIONS = `You are Cander Build — Codex applies MINIMAL draft edits in the sandbox.

Rules:
- Edit only what the user asked for. Do not rewrite the whole site.
- Prefer computer.files.read then computer.files.write / patch on existing paths.
- Never paste full HTML/JSX documents in chat.
- Never call build.publish or anything that deploys production.
- Do not run computer.files.persist — the host will commit once at the end.
- Prefer TypeScript/TSX. Never leave duplicate App Router siblings (page.js + page.tsx).
- Keep replies short after tools: what changed + that draft preview will refresh.

Call tools as JSON: {"tool":"computer.files.write","arguments":{"path":"app/page.tsx","content":"..."}}`;

function formatToolResultsNote(results: AiToolCallResult[]): string {
  return results
    .map((r) => `Tool ${r.name} (${r.ok ? "ok" : "failed"}):\n${r.output}`)
    .join("\n\n");
}

function isEditToolName(name: string): boolean {
  return (
    (name.startsWith("build.") && name !== "build.publish") ||
    name.startsWith("computer.files")
  );
}

function labelForTool(name: string): string {
  if (name.startsWith("computer.files")) return "Updating draft files…";
  if (name.startsWith("build.")) return "Build tool…";
  return "Working…";
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
    return { ok: true, detail: result.message || `Sandbox ${result.status}` };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function summarizePlanForEdit(artifacts: Awaited<ReturnType<typeof loadPlanFirstArtifacts>>): string {
  const plan = artifacts.buildPlan?.json;
  if (!plan) return "No BuildPlan on file — edit existing tip files only.";
  const nav = (plan.nav ?? [])
    .map((n) => `${n.label}:${n.href}`)
    .slice(0, 12)
    .join(", ");
  const pages = (plan.sitemap ?? [])
    .map((p) => ("path" in p ? p.path : "/"))
    .slice(0, 12)
    .join(", ");
  return [
    `BuildPlan version: ${artifacts.buildPlan?.version ?? "?"}`,
    nav ? `Nav: ${nav}` : null,
    pages ? `Sitemap: ${pages}` : null,
    plan.designSystem
      ? `Design: ${JSON.stringify(plan.designSystem).slice(0, 400)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runEditWebsitePipeline(opts: {
  request: AiGenerateRequest;
  turnOpts?: AgentTurnOptions;
  projectId: string;
  workspaceId: string;
  websiteBrief: WebsiteSetupBrief | null;
  report: NonNullable<AgentTurnOptions["onProgress"]>;
}): Promise<AgentTurnResult> {
  const { request, turnOpts, projectId, workspaceId, websiteBrief, report } =
    opts;
  const toolResults: AiToolCallResult[] = [];
  const allowedTools = editToolNames();

  if (editPathAllowsPublish(allowedTools)) {
    throw new Error("Edit path must not allow build.publish");
  }

  if (websiteBrief) {
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
    detail: "Inspecting plan and draft tip…",
  });

  const artifacts = await loadPlanFirstArtifacts(projectId, workspaceId);
  const tip = await inspectProjectDraftTipClient({ projectId, workspaceId });
  const tipSha = tip?.draftSha ?? null;
  const tipPaths = tip?.paths ?? [];

  if (!tipSha) {
    report({
      phase: "thinking",
      label: "Building",
      detail: "No draft tip yet — writing a runnable scaffold first…",
    });
    const { minimalRunnableScaffoldFiles } = await import(
      "@/lib/ai/build/minimal-runnable-scaffold"
    );
    const { commitProjectDraftFilesClient } = await import(
      "@/lib/api/project-git-client"
    );
    const files = minimalRunnableScaffoldFiles({
      title:
        String(
          (websiteBrief?.answers as { business_goal?: string } | undefined)
            ?.business_goal || "Site",
        ).slice(0, 80),
    });
    const seeded = await commitProjectDraftFilesClient({
      projectId,
      workspaceId,
      files,
      message: "Cander: seed runnable draft scaffold",
    });
    if (!seeded?.ok) {
      return {
        content: [
          "This project doesn’t have a draft tip yet, and I couldn’t seed one automatically.",
          seeded?.error || "Git persist failed.",
        ].join("\n"),
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
      };
    }
  }

  const tipAfterSeed = tipSha
    ? tip
    : await inspectProjectDraftTipClient({ projectId, workspaceId });
  let tipPathsLive = tipAfterSeed?.paths ?? tipPaths;
  let tipShaLive = tipAfterSeed?.draftSha ?? tipSha;

  const { tipLooksRunnable, minimalRunnableScaffoldFiles } = await import(
    "@/lib/ai/build/minimal-runnable-scaffold"
  );
  const repairIntent = /\b(repair|fix)\b/i.test(request.content);

  if (tipShaLive && (!tipLooksRunnable(tipPathsLive) || repairIntent)) {
    report({
      phase: "thinking",
      label: "Building",
      detail: "Healing draft scaffold and preview…",
    });
    const { commitProjectDraftFilesClient } = await import(
      "@/lib/api/project-git-client"
    );
    if (!tipLooksRunnable(tipPathsLive)) {
      const files = minimalRunnableScaffoldFiles({
        title:
          String(
            (websiteBrief?.answers as { business_goal?: string } | undefined)
              ?.business_goal || "Site",
          ).slice(0, 80),
      });
      const healed = await commitProjectDraftFilesClient({
        projectId,
        workspaceId,
        files,
        message: "Cander: heal runnable draft scaffold",
      });
      if (healed?.ok) {
        toolResults.push({
          name: "computer.files.persist",
          ok: true,
          output: `Healed scaffold → ${healed.draftSha?.slice(0, 7) || "draft"}`,
        });
        const refreshed = await inspectProjectDraftTipClient({
          projectId,
          workspaceId,
        });
        tipPathsLive = refreshed?.paths ?? tipPathsLive;
        tipShaLive = refreshed?.draftSha ?? tipShaLive;
      }
    }

    const sync = await ensureSandboxReady({
      projectId,
      workspaceId,
      forceRestart: true,
    });
    if (sync.ok) {
      const finalized = await requestBuildReadyClient({
        projectId,
        workspaceId,
      });
      if (finalized?.ok && repairIntent) {
        return {
          content: [
            "Repaired the draft scaffold and re-checked preview.",
            tipShaLive ? `Draft tip ${tipShaLive.slice(0, 7)}.` : "",
            "Production was not changed.",
          ]
            .filter(Boolean)
            .join(" "),
          runtime: "cloud",
          offline: false,
          condensationOccurred: false,
          aiChatId: request.aiChatId ?? null,
          toolResults,
        };
      }
    }
  }

  const structural = STRUCTURAL_EDIT_RE.test(request.content);
  let twentyFirstNote = "";

  // Optional plan touch: record edit intent on implementation manifest.
  if (structural && artifacts.buildPlan) {
    report({
      phase: "thinking",
      label: "Building",
      detail: "Updating plan notes for structural edit…",
    });
    await savePlanFirstArtifacts({
      projectId,
      workspaceId,
      implementationManifest: {
        version: 1,
        files: tipPathsLive.slice(0, 80).map((path) => ({ path })),
        routes: (artifacts.buildPlan.json.sitemap ?? []).map((p) => ({
          path: "path" in p ? p.path : "/",
          pageId: "id" in p ? p.id : undefined,
        })),
        tasks: ["edit", "inspect", structural ? "structural" : "copy"],
        validation: { ok: false, technical: [], visual: [] },
        updatedAt: new Date().toISOString(),
      },
    });
  }

  // Optional 21st for structural + component-ish asks.
  if (structural && WANTS_21ST_RE.test(request.content) && artifacts.buildPlan?.json) {
    report({
      phase: "thinking",
      label: "Building",
      detail: "Looking up components for this edit…",
    });
    try {
      const retrieved = await retrieveTwentyFirstForBuildPlanClient({
        workspaceId,
        projectId,
        buildPlan: artifacts.buildPlan.json,
      });
      const components = retrieved?.components ?? [];
      if (components.length) {
        twentyFirstNote = [
          "",
          "Optional 21st.dev components (adapt only if they fit the edit):",
          formatRetrievedComponentsForCodex(components).slice(0, 8000),
        ].join("\n");
      }
    } catch (err) {
      console.warn("[cander:edit] 21st retrieve skipped", err);
    }
  }

  report({
    phase: "thinking",
    label: "Preparing environment",
    detail: "Syncing sandbox to draft tip…",
  });
  const boot = await ensureSandboxReady({
    projectId,
    workspaceId,
    forceRestart: false,
  });
  if (!boot.ok) {
    return {
      content: `I couldn’t start the draft environment for edits: ${boot.detail}`,
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
    };
  }

  const inspectContext = [
    EDIT_INSTRUCTIONS,
    `Active projectId: ${projectId}`,
    `workspaceId: ${workspaceId}`,
    `Draft tip SHA: ${tipSha}`,
    `Tip files (${tipPaths.length}): ${tipPaths.slice(0, 80).join(", ")}`,
    summarizePlanForEdit(artifacts),
    twentyFirstNote,
    "Apply a minimal edit for the user request. Do not recreate the whole site.",
  ]
    .filter(Boolean)
    .join("\n\n");

  report({
    phase: "thinking",
    label: "Building",
    detail: "Applying minimal draft edit…",
  });

  let working: AiGenerateRequest = {
    ...request,
    allowTools: true,
    allowedToolNames: allowedTools,
    modelMode: "coding",
    toolContext: [formatToolsForPrompt(allowedTools), inspectContext].join(
      "\n\n",
    ),
  };

  let forcedToolRetry = false;
  const pendingWrites = new Map<string, string>();

  for (let round = 0; round < EDIT_MAX_ROUNDS; round++) {
    if (turnOpts?.signal?.aborted) {
      return {
        content: "",
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
      };
    }

    if (round > 0) {
      report({
        phase: "follow_up",
        label: "Building",
        detail: "Continuing edit…",
        contentStreaming: true,
      });
    }

    const generated = await runRawOpenAITurn(working, {
      ...turnOpts,
      suppressContentDelta: true,
    });
    const { text, call } = parseToolCallFromContent(generated.content);

    let toolCall = call;
    if (toolCall && !allowedTools.includes(toolCall.name)) toolCall = null;
    if (toolCall && !isEditToolName(toolCall.name)) toolCall = null;
    if (toolCall?.name === "build.publish") toolCall = null;
    if (toolCall?.name === "computer.files.persist") toolCall = null;

    if (!toolCall) {
      const visible =
        sanitizeAssistantVisibleText(text || generated.content).trim() || "";
      const writes = toolResults.filter(
        (r) =>
          (r.name === "computer.files.write" ||
            r.name === "computer.files.patch") &&
          r.ok,
      ).length;

      if (!forcedToolRetry && writes === 0) {
        forcedToolRetry = true;
        working = {
          ...working,
          content: [
            request.content,
            "",
            "Use computer.files.write or computer.files.patch on existing draft files. No code dumps. No full-site rewrite.",
          ].join("\n"),
        };
        continue;
      }

      // End of tool loop — commit once if we wrote.
      break;
    }

    report({
      phase: "tool",
      label: "Building",
      detail: labelForTool(toolCall.name),
      toolName: toolCall.name,
      contentStreaming: true,
    });

    const args: Record<string, unknown> = {
      projectId,
      workspaceId,
      ...(toolCall.arguments ?? {}),
    };
    // Defer git commit to a single persist at the end.
    if (
      toolCall.name === "computer.files.write" ||
      toolCall.name === "computer.files.patch"
    ) {
      args.persist = false;
      const path = String(args.path ?? "").trim();
      const content = String(args.content ?? args.patch ?? "");
      if (path && toolCall.name === "computer.files.write" && content) {
        pendingWrites.set(path, content);
      }
    }

    const result = await executeAuthorizedTool({
      name: toolCall.name,
      arguments: args,
    });
    toolResults.push(result);
    report({
      phase: "follow_up",
      label: "Building",
      detail: labelForTool(toolCall.name),
      toolName: toolCall.name,
      toolOk: result.ok,
      contentStreaming: true,
    });

    working = {
      ...working,
      modelMode: "coding",
      toolContext: [
        formatToolsForPrompt(allowedTools),
        inspectContext,
        formatToolResultsNote(toolResults),
        "Continue only if more minimal edits remain, then stop for a short summary.",
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

  const wrote =
    pendingWrites.size > 0 ||
    toolResults.some(
      (r) =>
        (r.name === "computer.files.write" ||
          r.name === "computer.files.patch") &&
        r.ok,
    );

  if (!wrote) {
    return {
      content:
        "I inspected the draft but didn’t change files. Try a more specific edit (e.g. “make the hero darker” or “add a pricing section”).",
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
      toolResults,
    };
  }

  // Light validate on collected writes (patch-only edits may have empty map).
  if (pendingWrites.size > 0) {
    const files: ScaffoldFile[] = [...pendingWrites.entries()].map(
      ([path, content]) => ({ path, content }),
    );
    const dup = duplicateAppRouterValidationIssues(files.map((f) => f.path));
    if (dup.length) {
      return {
        content: [
          "Edit blocked — duplicate App Router files:",
          ...dup.map((i) => `- ${i}`),
        ].join("\n"),
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
      };
    }
    // Soft validate without full SiteSpec — only flag empty files.
    const empty = files.filter((f) => !f.content.trim()).map((f) => f.path);
    if (empty.length) {
      return {
        content: `Edit blocked — empty file write(s): ${empty.join(", ")}`,
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
      };
    }
  }

  report({
    phase: "thinking",
    label: "Building",
    detail: "Saving one draft commit…",
  });

  const committed = await persistProjectSandboxDraftClient({
    projectId,
    workspaceId,
    message: `Cander: draft edit — ${request.content.trim().slice(0, 72)}`,
  });

  if (!committed?.ok) {
    const syncFail =
      committed?.outcome === "db_sync_failed" ||
      /database draft_sha sync/i.test(committed?.error || "");
    return {
      content: syncFail
        ? [
            `Draft tip advanced on GitHub${committed?.draftSha ? ` (${committed.draftSha.slice(0, 7)})` : ""}, but database sync failed: ${committed?.error || "unknown"}.`,
            "Preview may show a stale tip until sync recovers — production was not published.",
          ].join("\n")
        : `Edits were applied in the sandbox but failed to commit to the draft tip: ${committed?.error || "unknown error"}. Try again.`,
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
      toolResults,
    };
  }

  if (
    (committed.outcome === "noop" || committed.noop) &&
    pendingWrites.size > 0
  ) {
    return {
      content: [
        "Sandbox edits did not produce a draft commit (persist returned noop) even though file writes were requested.",
        committed.error || "Nothing landed on cander/draft — try the edit again.",
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
    detail: "Syncing preview to new tip…",
  });

  const sync = await ensureSandboxReady({
    projectId,
    workspaceId,
    forceRestart: true,
  });
  if (!sync.ok) {
    return {
      content: [
        committed.outcome === "partial"
          ? `Partial draft commit${committed.draftSha ? ` (${committed.draftSha.slice(0, 7)})` : ""} (some paths skipped), but preview sync failed: ${sync.detail}`
          : `Draft edit committed${committed.draftSha ? ` (${committed.draftSha.slice(0, 7)})` : ""}, but preview sync failed: ${sync.detail}`,
        "Ask me to retry the preview boot — production was not touched.",
      ].join("\n"),
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
      toolResults,
    };
  }

  const finalized = await requestBuildReadyClient({ projectId, workspaceId });
  if (!finalized?.ok) {
    const reason =
      finalized?.reason || finalized?.error || "Preview check failed.";
    const diag = finalized?.diagnostics
      ? `\nDiagnostics: ${finalized.diagnostics}`
      : "";
    const healLine = finalized?.healAttempted
      ? "An automatic preview heal was attempted and did not recover."
      : "Preview was not marked ready.";
    return {
      content: [
        `Draft edit saved${committed.draftSha ? ` at ${committed.draftSha.slice(0, 7)}` : ""}${
          committed.outcome === "partial" ? " (partial)" : ""
        }, but preview check failed: ${reason}${diag}`,
        `${healLine} Production was not published.`,
      ].join("\n"),
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
      toolResults,
    };
  }

  const fileCount =
    committed.paths?.length ||
    committed.deletedPaths?.length ||
    pendingWrites.size ||
    1;

  const saveNote =
    committed.outcome === "partial"
      ? `Partially updated the **draft** (${fileCount} path${fileCount === 1 ? "" : "s"}; some files skipped${
          committed.draftSha ? ` · ${committed.draftSha.slice(0, 7)}` : ""
        }).`
      : committed.outcome === "noop" || committed.noop
        ? "No new draft changes to save (working tree already matched the tip)."
        : `Updated the **draft** (${fileCount} file${fileCount === 1 ? "" : "s"}${
            committed.draftSha ? ` · ${committed.draftSha.slice(0, 7)}` : ""
          }).`;

  return {
    content: [
      saveNote,
      "Preview should refresh on the draft tip. Production was not changed — use Publish when you want to go live.",
    ].join(" "),
    runtime: "cloud",
    offline: false,
    condensationOccurred: false,
    aiChatId: request.aiChatId ?? null,
    toolResults,
  };
}
