/**
 * Capability compiler — builds TurnProfile before every Apple FM call.
 */

import {
  resolveAllowedToolsForTurn,
  type TaskStateLike,
} from "../tools/domains.ts";
import {
  initialDeterministicToolCalls,
  requiresExternalEvidence,
} from "../orchestrator/deterministic-triggers.ts";
import { liveInfoHint } from "../orchestrator/v2-helpers.ts";
import { inferResponseContract } from "../answer-shape/index.ts";
import {
  deeperResearchQueries,
  extractFactualComponents,
  isCorrectionRetry,
} from "../orchestrator/research-quality.ts";
import { budgetsForProfile } from "./budgets.ts";
import {
  formatToolCardsForPrompt,
  selectToolCards,
} from "./tool-cards.ts";
import {
  inferDensity,
  resolveTurnState,
  wantsDeepMemorySearch,
  type TurnStateInput,
} from "./state-resolver.ts";
import { autoRetrieveMemorySnippets } from "./memory-auto.ts";
import type {
  BudgetProfileName,
  ContextPacket,
  PreRunTask,
  ToolMode,
  TurnProfile,
} from "./types.ts";
import { MAX_TOOLS_PER_TURN } from "./types.ts";
import type { ConversationTurnState } from "./conversation-types.ts";

export type CompileTurnOptions = {
  content: string;
  taskState?: TaskStateLike;
  messages?: Array<{ role: string; content: string }>;
  attachmentSummaries?: string[];
  memorySnippets?: string[];
  activeBrowserMeta?: string;
  pendingStateText?: string;
  /** Evidence already collected (e.g. after pre-run). */
  evidence?: ContextPacket["evidence"];
  budgetProfile?: BudgetProfileName;
  /** Desktop can raise concurrency via on_device_large or override. */
  isDesktop?: boolean;
  uiResume?: TurnStateInput["uiResume"];
  outputSchema?: TurnProfile["outputSchema"];
  /** Resolved conversation state from delta pipeline. */
  conversationState?: ConversationTurnState | null;
  /**
   * Build gate — only set when Build orchestrator is enabled AND
   * requiresBuildCapabilities. Never set on normal chat/research.
   */
  build?: {
    requiresBuildCapabilities: boolean;
    buildSpecSlice?: string | null;
    forceDomains?: string[];
    /** Read-only pre-run only (spec.read). Mutating ops are not pre-run. */
    readOnlyPreRun?: boolean;
    needsClarification?: boolean;
    clarificationReason?: string;
  };
};

function buildPreRunTasks(content: string): PreRunTask[] {
  return initialDeterministicToolCalls(content).map((c) => ({
    name: c.name,
    arguments: c.arguments,
    reason: c.reason,
  }));
}

/**
 * Decide toolMode. Prefer preRunTasks over `required`.
 * `required` only when a mandatory tool remains unsatisfied by pre-run (rare).
 */
export function resolveToolMode(opts: {
  content: string;
  preRunTasks: PreRunTask[];
  toolNames: string[];
  clarificationRequired: boolean;
}): ToolMode {
  const { content, preRunTasks, toolNames } = opts;
  if (!toolNames.length && !preRunTasks.length) return "disallowed";
  // After obvious retrieval is scheduled, FM should synthesize — not choose search.
  if (preRunTasks.length && requiresExternalEvidence(content)) {
    // Residual non-web tools may stay allowed; web.* is covered by pre-run / escalate.
    const residual = toolNames.filter(
      (n) =>
        !preRunTasks.some((t) => t.name === n) &&
        !n.startsWith("web.") &&
        n !== "ui.ask_clarification" &&
        n !== "ui.confirm",
    );
    return residual.length ? "allowed" : "disallowed";
  }
  if (!toolNames.length) return "disallowed";
  return "allowed";
}

/**
 * Clarification only when ambiguity is unresolved AND consequential.
 * Default false — autonomy first.
 */
export function resolveClarificationRequired(opts: {
  content: string;
  taskState?: TaskStateLike;
  domains: string[];
  conversationState?: ConversationTurnState | null;
}): { clarificationRequired: boolean; reason?: string } {
  if (opts.conversationState?.clarificationRequired) {
    return {
      clarificationRequired: true,
      reason: "unresolved_low_confidence_ambiguity",
    };
  }
  const t = opts.content.trim();
  const task = opts.taskState;
  if (task?.pendingClarification) {
    return { clarificationRequired: false };
  }
  // Destructive / publish / connector connect without enough detail
  if (
    /\b(delete|remove|destroy|permanently)\b[\s\S]{0,40}\b(project|space|account)\b/i.test(
      t,
    ) &&
    !/\b(named|called|titled)\b/i.test(t)
  ) {
    return {
      clarificationRequired: true,
      reason: "destructive_action_ambiguous_target",
    };
  }
  if (
    /\b(publish|deploy)\b/i.test(t) &&
    !/\b(this|current|project)\b/i.test(t) &&
    opts.domains.includes("projects")
  ) {
    return {
      clarificationRequired: true,
      reason: "publish_target_ambiguous",
    };
  }
  return { clarificationRequired: false };
}

export function compileTurnProfile(opts: CompileTurnOptions): TurnProfile {
  const content = (opts.content || "").trim();
  const resolved = resolveTurnState({
    content,
    taskState: opts.taskState as TurnStateInput["taskState"],
    uiResume: opts.uiResume,
  });

  let preRunTasks = buildPreRunTasks(content);
  const conv = opts.conversationState;
  const deepRetry =
    Boolean(conv?.dissatisfactionSignal) ||
    Boolean(conv?.freshnessRequirement) ||
    isCorrectionRetry(content);

  // Freshness / dissatisfaction / external flags from conversation state force retrieval.
  if (
    conv &&
    (conv.freshnessRequirement ||
      conv.externalRetrievalRequired ||
      conv.dissatisfactionSignal) &&
    !preRunTasks.some((t) => t.name === "web.search") &&
    !conv.internalDataRequired
  ) {
    preRunTasks = [
      {
        name: "web.search",
        arguments: { query: content.slice(0, 400) },
        reason: conv.freshnessRequirement
          ? "conversation_freshness"
          : "conversation_external_required",
      },
      ...preRunTasks,
    ];
  }

  // Deeper first-pass / retry: component searches + official queries.
  if (
    (deepRetry || extractFactualComponents(content).length >= 2) &&
    !conv?.internalDataRequired
  ) {
    const prior = preRunTasks
      .map((t) => String(t.arguments.query ?? ""))
      .filter(Boolean);
    const extras = deeperResearchQueries(content, prior);
    for (const query of extras) {
      if (preRunTasks.length >= 5) break;
      preRunTasks.push({
        name: "web.search",
        arguments: { query },
        reason: deepRetry ? "correction_deeper_research" : "multi_component_research",
      });
    }
  }

  const allowed = resolveAllowedToolsForTurn({
    content,
    taskState: opts.taskState,
    forceDomains: opts.build?.requiresBuildCapabilities
      ? (opts.build.forceDomains as import("../tools/domains.ts").ToolDomain[] | undefined)
      : undefined,
  });

  // When pre-running live web, ensure web domain tools exist for residual opens,
  // but compiler will usually set toolMode disallowed after pre-run.
  let toolNames = [...allowed.toolNames];
  if (
    preRunTasks.some((t) => t.name.startsWith("web.")) &&
    !toolNames.includes("web.search")
  ) {
    // Keep empty for FM — pre-run handles retrieval; do not inflate catalog.
  }

  // Deep memory search tool — only when explicitly requested (placeholder name
  // mapped to workspace.search until a dedicated tool exists).
  if (wantsDeepMemorySearch(content) && !toolNames.includes("workspace.search")) {
    toolNames = [...toolNames, "workspace.search"];
  }

  if (conv?.internalDataRequired) {
    if (!toolNames.includes("workspace.search")) {
      toolNames = [...toolNames, "workspace.search"];
    }
  }

  // Build: slice is already loaded by the gate — do not mutate via pre-run.
  // (Mutating Build ops belong to the execution stage after TurnPlan.)

  let clarification = resolveClarificationRequired({
    content,
    taskState: opts.taskState,
    domains: allowed.domains,
    conversationState: conv,
  });
  if (opts.build?.needsClarification) {
    clarification = {
      clarificationRequired: true,
      reason: opts.build.clarificationReason ?? "ambiguous_build_project",
    };
  }

  const toolMode = resolveToolMode({
    content,
    preRunTasks,
    toolNames,
    clarificationRequired: clarification.clarificationRequired,
  });

  let cards =
    toolMode === "disallowed"
      ? []
      : selectToolCards(toolNames, {
          max: MAX_TOOLS_PER_TURN,
          clarificationAllowed: clarification.clarificationRequired,
        });

  // Prefer ≤3 when many domains unlocked
  if (cards.length > 3 && !clarification.clarificationRequired) {
    cards = cards.slice(0, 3);
  }

  // Density from conversation answer shape when present
  const densityFromShape =
    conv?.desiredAnswerShape === "brief" ||
    conv?.desiredAnswerShape === "key_points"
      ? ("brief" as const)
      : conv?.desiredAnswerShape === "detailed"
        ? ("detailed" as const)
        : null;

  const budgetName: BudgetProfileName =
    opts.budgetProfile ??
    (opts.isDesktop ? "on_device_large" : "on_device_small");
  const budgets = budgetsForProfile(budgetName);
  if (opts.isDesktop && budgetName === "on_device_small") {
    budgets.concurrency = Math.max(budgets.concurrency, 4);
  }

  const responseContract = inferResponseContract(content);
  budgets.maxOutputTokens = Math.max(
    budgets.maxOutputTokens,
    responseContract.outputTokenBudget,
  );
  if (responseContract.depth === "detailed" || responseContract.requestedItemCount) {
    budgets.maxPromptChars = Math.max(
      budgets.maxPromptChars,
      Math.min(budgets.maxPromptChars + 4_000, budgets.contextTokens * 4),
    );
  }
  if (deepRetry || extractFactualComponents(content).length >= 2) {
    budgets.earlySynthesizeWhenSufficient = false;
    budgets.maxToolRounds = Math.max(budgets.maxToolRounds, 3);
  }

  const densityFromContract =
    responseContract.depth === "detailed"
      ? ("detailed" as const)
      : responseContract.depth === "brief"
        ? ("brief" as const)
        : null;

  const recent = (opts.messages ?? []).slice(-12).map((m) => ({
    role: m.role,
    content: String(m.content ?? "").slice(0, 800),
  }));

  const pendingBits = [opts.pendingStateText ?? ""];
  if (conv?.constraints && Object.keys(conv.constraints).length) {
    pendingBits.push(
      `Resolved constraints: ${JSON.stringify(conv.constraints)}`,
    );
  }
  if (conv?.freshnessRequirement) {
    pendingBits.push("Freshness required — do not reuse stale prior answers.");
  }
  if (conv?.dissatisfactionSignal || deepRetry) {
    pendingBits.push(
      "Prior answer was wrong or incomplete. Do deeper retrieval and reconciliation before answering. Never tell the user to check the menu or website themselves when tools can investigate.",
    );
  }

  const contextPacket: ContextPacket = {
    currentRequest: content,
    recentTurns: recent,
    pendingStateText: pendingBits.filter(Boolean).join("\n"),
    attachmentSummaries: opts.attachmentSummaries ?? [],
    memorySnippets:
      opts.memorySnippets ??
      autoRetrieveMemorySnippets({
        content,
        messages: opts.messages,
      }),
    evidence: opts.evidence ?? [],
    activeBrowserMeta: opts.activeBrowserMeta ?? "",
    ...(opts.build?.requiresBuildCapabilities && opts.build.buildSpecSlice
      ? { buildSpecSlice: opts.build.buildSpecSlice }
      : {}),
  };

  // Carry resolved correction into pending text for FM
  if (resolved.correctionNote && !contextPacket.pendingStateText) {
    contextPacket.pendingStateText = `User correction: ${resolved.correctionNote}`;
  }

  return {
    contextPacket,
    tools: cards,
    toolMode,
    preRunTasks,
    clarificationPolicy: {
      clarificationRequired: clarification.clarificationRequired,
      reason: clarification.reason,
      allowedInteractionTypes: clarification.clarificationRequired
        ? ["select_one", "text_input", "confirm"]
        : [],
    },
    density: densityFromShape ?? densityFromContract ?? inferDensity(content),
    outputSchema: opts.outputSchema ?? "semantic_blocks_v1",
    budgets,
    domains: allowed.domains,
  };
}

export function formatTurnProfileInstructions(
  profile: TurnProfile,
  extra?: string,
): string {
  const parts: string[] = [
    "## Turn profile",
    `toolMode=${profile.toolMode}; density=${profile.density}; maxToolRounds=${profile.budgets.maxToolRounds}; maxOutputTokens≈${profile.budgets.maxOutputTokens}`,
    profile.clarificationPolicy.clarificationRequired
      ? `Clarification allowed (${profile.clarificationPolicy.reason ?? "ambiguous"}). Use the smallest UI tool.`
      : "Do not ask clarifying questions or call ui.ask_clarification this turn.",
    formatToolCardsForPrompt(profile.tools),
  ];
  if (profile.contextPacket.pendingStateText) {
    parts.push(profile.contextPacket.pendingStateText);
  }
  if (profile.contextPacket.memorySnippets.length) {
    parts.push(
      "## Retrieved memory",
      ...profile.contextPacket.memorySnippets.slice(0, 4),
    );
  }
  if (profile.contextPacket.attachmentSummaries.length) {
    parts.push(
      "## Attachments",
      ...profile.contextPacket.attachmentSummaries.slice(0, 4),
    );
  }
  if (profile.contextPacket.activeBrowserMeta) {
    parts.push(profile.contextPacket.activeBrowserMeta);
  }
  if (profile.contextPacket.buildSpecSlice) {
    parts.push("## BuildSpec (slice)", profile.contextPacket.buildSpecSlice);
  }
  if (profile.preRunTasks.length && profile.toolMode === "disallowed") {
    parts.push(
      "Retrieval already ran for this turn. Synthesize an answer from compact evidence only. Do not call tools.",
    );
  }
  if (extra) parts.push(extra);
  return parts.filter(Boolean).join("\n\n");
}

/** True when live-info path should skip FM tool choice entirely after pre-run. */
export function isObviousRetrievalTurn(content: string): boolean {
  return (
    liveInfoHint(content) ||
    requiresExternalEvidence(content) ||
    initialDeterministicToolCalls(content).length > 0
  );
}

export { formatToolCardsForPrompt };
