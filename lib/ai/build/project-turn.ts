/**
 * Build project chat turns (Website Builder V2).
 *
 * Architecture:
 * - Plan / clarify (themes, URLs, UI, goals) → chat model, no code dumps.
 * - Questions about the site → chat model with brief + draft tree as context.
 * - Create / change requests → a builder job running INSIDE the project
 *   sandbox (builder/*.mjs) — this file only starts jobs and replies; results
 *   arrive through the job event stream (useBuildJob → chat).
 * - Publish / republish → hands off to the Publish panel.
 * Sites and apps share the same builder with a per-kind prompt profile.
 */

import type {
  AgentTurnOptions,
  AgentTurnResult,
} from "@/lib/ai/runtime/agent-turn";
import { runRawOpenAITurn } from "@/lib/ai/raw-openai/run-turn";
import type { AiGenerateRequest } from "@/lib/ai/runtime/types";
import { sanitizeAssistantVisibleText } from "@/lib/ai/tool-protocol";
import { isBuildCreateIntent } from "@/lib/ai/build/capabilities";
import {
  classifyBuildMessageIntent,
  looksLikeCodeDump,
} from "@/lib/ai/build/intent";
import {
  mergeAnswersIntoBrief,
  needsWebsiteGuidedSetup,
  WEBSITE_SETUP_RESUME_TOOL,
  type WebsiteSetupBrief,
} from "@/lib/ai/build/website-setup-brief";
import {
  getProjectKindForSetup,
  loadWebsiteSetupBrief,
  saveWebsiteSetupBrief,
} from "@/lib/build/website-setup-brief-store";
import {
  briefStatusFromBuildPhase,
  getProjectBuildPhase,
} from "@/lib/build/build-phase";

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

function isBuildPlanIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isBuildCreateIntent(t) || IMPLEMENT_INTENT_RE.test(t)) return false;
  return PLAN_INTENT_RE.test(t);
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

const SITE_CHAT_INSTRUCTIONS = `You are Cander — the user's website builder, talking about THEIR site.

You are answering a question or reacting to feedback. Do NOT write code and do NOT paste files.
- Use the site context below (brief + current file tree) to answer concretely.
- If the user is asking for a change, confirm what you'd change in one sentence and invite them to say so ("Want me to make that change?").
- If they want to go live, tell them to press Publish (or say "publish").
- Keep it short and friendly. No headings unless listing pages.`;

/**
 * Questions / feedback inside a site project: chat model, no tools, no writes.
 * Context = setup brief + draft tip file list so answers are about THIS site.
 */
async function runSiteChatTurn(
  request: AiGenerateRequest,
  opts: AgentTurnOptions | undefined,
  ctx: {
    projectId: string;
    workspaceId: string;
    websiteBrief: WebsiteSetupBrief | null;
  },
): Promise<AgentTurnResult> {
  const report = opts?.onProgress ?? (() => {});
  report({
    phase: "thinking",
    label: "Thinking",
    detail: "Looking at your site…",
  });

  let tipPaths: string[] = [];
  let tipSha: string | null = null;
  try {
    const { inspectProjectDraftTipClient } = await import(
      "@/lib/api/project-git-client"
    );
    const tip = await inspectProjectDraftTipClient({
      projectId: ctx.projectId,
      workspaceId: ctx.workspaceId,
    });
    tipPaths = tip?.paths ?? [];
    tipSha = tip?.draftSha ?? null;
  } catch {
    /* context is best-effort */
  }

  const pages = tipPaths
    .filter((p) => /^app\/.*page\.tsx$/.test(p))
    .map((p) => {
      const route = p.replace(/^app/, "").replace(/\/page\.tsx$/, "") || "/";
      return route.replace(/\/\([^)]+\)/g, "") || "/";
    });

  const context = [
    SITE_CHAT_INSTRUCTIONS,
    ctx.websiteBrief?.answers
      ? `Setup brief:\n${JSON.stringify(ctx.websiteBrief.answers).slice(0, 4000)}`
      : "Setup brief: (none yet)",
    tipSha
      ? `Draft tip ${tipSha.slice(0, 7)} — routes: ${pages.join(", ") || "(none)"}\nFiles (${tipPaths.length}): ${tipPaths.slice(0, 120).join(", ")}`
      : "Draft: no files committed yet.",
  ].join("\n\n");

  const generated = await runRawOpenAITurn(
    {
      ...request,
      allowTools: false,
      allowedToolNames: undefined,
      toolContext: context,
      modelMode: "chat",
    },
    opts,
  );

  let content =
    sanitizeAssistantVisibleText(generated.content || "").trim() ||
    generated.content ||
    "";
  if (looksLikeCodeDump(content)) {
    content =
      "Happy to make that change — just tell me what to update (for example “make the header sticky” or “swap the hero photo”) and I’ll edit the draft.";
  }

  return {
    content,
    runtime: generated.runtime ?? "cloud",
    offline: Boolean(generated.offline),
    condensationOccurred: Boolean(generated.condensationOccurred),
    aiChatId: generated.aiChatId ?? request.aiChatId ?? null,
    toolResults: [],
  };
}

/**
 * "publish" / "republish" typed in chat. Publishing is a user-confirmed
 * action, so we hand off to the Publish flow instead of writing files.
 */
async function runSitePublishCommandTurn(
  request: AiGenerateRequest,
  opts: AgentTurnOptions | undefined,
  ctx: {
    projectId: string;
    workspaceId: string;
    websiteBrief: WebsiteSetupBrief | null;
  },
): Promise<AgentTurnResult> {
  const report = opts?.onProgress ?? (() => {});
  report({
    phase: "thinking",
    label: "Publishing",
    detail: "Checking the draft…",
  });
  // Browser turns cannot read build_phase directly; the brief status is the
  // build_phase mirror (GET /website-setup overlays it).
  let ready = ctx.websiteBrief?.status === "ready";
  try {
    const phase = await getProjectBuildPhase({
      projectId: ctx.projectId,
      workspaceId: ctx.workspaceId,
    });
    if (phase) ready = phase === "ready";
  } catch {
    /* fall through */
  }

  // Draft vs live: republish only makes sense when the tip moved.
  let publishState: "never" | "ahead" | "current" | "unknown" = "unknown";
  let liveUrl: string | null = null;
  if (typeof window !== "undefined") {
    try {
      const { fetchPublishStatusClient } = await import("@/lib/api/project-publish-client");
      const status = await fetchPublishStatusClient({
        projectId: ctx.projectId,
        workspaceId: ctx.workspaceId,
      });
      if (status) {
        liveUrl = status.publishedUrl;
        publishState = !status.published ? "never" : status.aheadOfLive ? "ahead" : "current";
      }
    } catch {
      /* unknown */
    }
  }

  let content: string;
  if (!ready) {
    content =
      "The draft isn’t ready to publish yet — let it finish building (or ask me to fix what’s blocking it) and then say **publish**.";
  } else if (publishState === "current") {
    content = `Your live site is already up to date with this draft${liveUrl ? ` (${liveUrl})` : ""}. Make a change first, then say **republish**.`;
  } else if (publishState === "ahead") {
    content =
      "Your draft has changes that aren’t live yet. I’ve opened the publish panel — confirm to republish and I’ll run a live check afterwards.";
  } else {
    content =
      "Ready to go live. I’ve opened the publish panel — pick your domain and confirm, and I’ll verify the live site once it’s up.";
  }
  if (ready && publishState !== "current" && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cander:open-publish", { detail: { projectId: ctx.projectId } }));
  }

  return {
    content,
    runtime: "cloud",
    offline: false,
    condensationOccurred: false,
    aiChatId: request.aiChatId ?? null,
    toolResults: [
      {
        name: "build.publish",
        ok: true,
        output: ready
          ? `publish_requested:ready:${publishState}`
          : "publish_requested:not_ready",
        pauseForUser: true,
      },
    ],
  };
}

/**
 * V2 create: start a builder job in the sandbox. The chat reply is immediate;
 * the preview panel shows "Drafting your website" fed by the job's events and
 * the job itself commits + finalizes the draft when done.
 */
async function runBuildV2CreateTurn(
  request: AiGenerateRequest,
  opts: AgentTurnOptions | undefined,
  ctx: { projectId: string; workspaceId: string; instruction?: string },
): Promise<AgentTurnResult> {
  const report = opts?.onProgress ?? (() => {});
  const isApp = Boolean(ctx.instruction);
  report({
    phase: "thinking",
    label: "Building",
    detail: isApp ? "Starting your app build…" : "Starting your website build…",
  });
  const { startBuildJobClient } = await import("@/lib/api/build-jobs-client");
  const started = await startBuildJobClient({
    projectId: ctx.projectId,
    workspaceId: ctx.workspaceId,
    mode: "create",
    instruction: ctx.instruction,
    threadId: request.aiChatId ?? null,
  });
  if (!started.ok) {
    const alreadyRunning = started.status === 409;
    return {
      content: alreadyRunning
        ? `Your ${isApp ? "app" : "website"} is already being drafted — hang tight, the preview will update as soon as it’s ready.`
        : `I couldn’t start the build: ${started.error || "unknown error"}. ${isApp ? "Try again in a moment." : "Try **Build my site** again in a moment."}`,
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
      toolResults: [
        {
          name: "build.job.start",
          ok: false,
          output: started.error || `HTTP ${started.status}`,
        },
      ],
    };
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("cander:build-job-started", {
        detail: { projectId: ctx.projectId, jobId: started.job?.id },
      }),
    );
  }
  return {
    content: isApp
      ? "Drafting your app — hang tight. I’m planning the screens, wiring the data layer, writing the components, and checking every route. You’ll see the draft appear on the right when it’s ready."
      : "Drafting your website — hang tight. I’m planning the pages, writing the copy and components, and checking every route. You’ll see the draft appear on the right when it’s ready; this can take a while for a full site.",
    runtime: "cloud",
    offline: false,
    condensationOccurred: false,
    aiChatId: request.aiChatId ?? null,
    toolResults: [
      {
        name: "build.job.start",
        ok: true,
        output: `job ${started.job?.id ?? "?"} started`,
        data: { jobId: started.job?.id ?? null, mode: "create" },
      },
    ],
  };
}

/**
 * V2 edit: start (or queue) a builder job for a change request. Replies with a
 * short acknowledgement; the finished job posts its own result message via
 * `cander:build-job-finished` (see useBuildJob + AppProvider).
 */
/**
 * Compact recent chat history for the builder. Follow-ups like "make it darker"
 * or "same on the other pages" only make sense with the last few turns.
 */
export function formatConversationForBuilder(
  messages: AiGenerateRequest["messages"] | undefined,
  currentInstruction: string,
  opts: { maxTurns?: number; maxCharsPerTurn?: number } = {},
): string | null {
  const maxTurns = opts.maxTurns ?? 8;
  const maxChars = opts.maxCharsPerTurn ?? 400;
  const turns = (messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content?.trim())
    .map((m) => ({ role: m.role, content: m.content.trim() }));
  // Drop the in-flight user turn if the caller included it.
  if (turns.length && turns[turns.length - 1].role === "user" && turns[turns.length - 1].content === currentInstruction) {
    turns.pop();
  }
  const recent = turns.slice(-maxTurns);
  if (!recent.length) return null;
  return recent
    .map((m) => {
      const text = m.content.replace(/\s+/g, " ");
      const clipped = text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
      return `${m.role === "user" ? "User" : "Cander"}: ${clipped}`;
    })
    .join("\n");
}

async function runBuildV2EditTurn(
  request: AiGenerateRequest,
  opts: AgentTurnOptions | undefined,
  ctx: { projectId: string; workspaceId: string },
): Promise<AgentTurnResult> {
  const report = opts?.onProgress ?? (() => {});
  report({
    phase: "thinking",
    label: "Editing",
    detail: "Handing your change to the builder…",
  });
  const instruction = request.content.trim();
  const { startBuildJobClient } = await import("@/lib/api/build-jobs-client");
  const started = await startBuildJobClient({
    projectId: ctx.projectId,
    workspaceId: ctx.workspaceId,
    mode: "edit",
    instruction,
    conversation: formatConversationForBuilder(request.messages, instruction),
    threadId: request.aiChatId ?? null,
  });
  if (!started.ok) {
    return {
      content: `I couldn’t start that change: ${started.error || "unknown error"}. Try again in a moment.`,
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
      toolResults: [
        { name: "build.job.start", ok: false, output: started.error || `HTTP ${started.status}` },
      ],
    };
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("cander:build-job-started", {
        detail: { projectId: ctx.projectId, jobId: started.job?.id, mode: "edit" },
      }),
    );
  }
  const queued = started.status === 202;
  return {
    content: queued
      ? "Got it — I’m finishing the current build first, then I’ll do this one. I’ll confirm here when it’s in the preview."
      : "On it — making that change now. I’ll confirm here when it’s in the preview.",
    runtime: "cloud",
    offline: false,
    condensationOccurred: false,
    aiChatId: request.aiChatId ?? null,
    toolResults: [
      {
        name: "build.job.start",
        ok: true,
        output: `job ${started.job?.id ?? "?"} ${queued ? "queued" : "started"}`,
        data: { jobId: started.job?.id ?? null, mode: "edit", queued },
      },
    ],
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
/** Chat-side entry for Build projects (sites and apps). */
export async function runBuildProjectTurn(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  const projectId = request.projectId?.trim() || "";
  const workspaceId = request.workspaceId?.trim() || "";

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
    // Browser load goes through GET /website-setup, which already overlays
    // build_phase onto brief.status. Server load needs an explicit overlay.
    websiteBrief = await loadWebsiteSetupBrief(projectId, workspaceId);
    if (typeof window === "undefined") {
      const buildPhase = await getProjectBuildPhase({ projectId, workspaceId });
      if (buildPhase) {
        websiteBrief = {
          ...websiteBrief,
          status: briefStatusFromBuildPhase(buildPhase),
        };
      }
    }
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

  // Only unfinished guided setup blocks turns. Completed confirm / past-setup
  // status (including build_phase overlay) must allow repair/edit chat.
  if (isSiteProject && needsWebsiteGuidedSetup(websiteBrief)) {
    return {
      content: wantsCreate
        ? "Finish the website setup questions above the composer (all 8 steps), then confirm **Build my site**. I won’t generate a draft until then — the preview stays blank with the progress ring."
        : "Your website project is in guided setup. Answer the questions in the card above the composer — the preview stays blank until we build.",
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
    };
  }

  // Is there already a built draft? Sites mirror build_phase into the brief;
  // apps read build_phase directly.
  let alreadyBuilt = websiteBrief?.status === "ready";
  if (!isSiteProject) {
    try {
      const phase = await getProjectBuildPhase({ projectId, workspaceId });
      alreadyBuilt = phase === "ready";
    } catch {
      alreadyBuilt = false;
    }
  }

  // Create path → builder job (create mode).
  if (wantsCreate) {
    if (alreadyBuilt && GUIDED_SETUP_CONFIRM_RE.test(request.content)) {
      return {
        content:
          "Your website draft is already built. Tell me what you’d like to change, or say **publish** when you’re ready to go live.",
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
      };
    }
    if (alreadyBuilt) {
      // "build it / go ahead" on a finished project is a change request.
      return runBuildV2EditTurn(request, opts, { projectId, workspaceId });
    }
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
    return runBuildV2CreateTurn(request, opts, {
      projectId,
      workspaceId,
      // Apps have no guided brief: the message itself is the spec.
      instruction: isSiteProject ? undefined : request.content.trim(),
    });
  }

  // Everything else: route by intent so questions and feedback never start
  // a job, and publish hands off to the Publish panel.
  const intent = classifyBuildMessageIntent(request.content);
  if (intent === "chat_question") {
    return runSiteChatTurn(request, opts, {
      projectId,
      workspaceId,
      websiteBrief,
    });
  }
  if (intent === "publish_command") {
    return runSitePublishCommandTurn(request, opts, {
      projectId,
      workspaceId,
      websiteBrief,
    });
  }
  if (!alreadyBuilt && !isSiteProject) {
    // First message in a fresh app project that isn't an explicit create —
    // treat it as the build spec rather than an edit of nothing.
    return runBuildV2CreateTurn(request, opts, {
      projectId,
      workspaceId,
      instruction: request.content.trim(),
    });
  }
  return runBuildV2EditTurn(request, opts, { projectId, workspaceId });
}
