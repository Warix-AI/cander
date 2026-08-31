/**
 * Per-turn web retrieval plan — compiled before Exa / FM, no second agent stack.
 */

import {
  buildExaOutputSchema,
  buildRetrievalQuery,
  resolveExaRetrievalPolicy,
  wantsAutonomousResearch,
  type ExaRetrievalMode,
  type TurnRetrievalHints,
} from "../web-research/index.ts";
import { requiresExternalEvidence } from "../orchestrator/deterministic-triggers.ts";
import { extractRequestedUrl } from "../orchestrator/web-retrieval.ts";
import {
  isExplicitWebsiteInspectRequest,
} from "../orchestrator/url-open-path.ts";
import type { TemporalGrounding } from "../orchestrator/temporal-grounding.ts";
import { maybeAnchorRetrievalQuery } from "../orchestrator/temporal-grounding.ts";
import type { ConversationTurnState } from "./conversation-types.ts";
import type { TurnRelation } from "./turn-relation.ts";
import type { TurnTaskResolution } from "./turn-task.ts";

export type WebRetrievalPlanMode =
  | "none"
  | "fast"
  | "auto"
  | "deep-lite"
  | "deep"
  | "agent";

export type WebRetrievalOutput = "text" | "object";
export type WebRetrievalContentNeed = "highlights" | "full_text" | "subpages";

export type WebRetrievalPlan = {
  mode: WebRetrievalPlanMode;
  output: WebRetrievalOutput;
  requestedFields: string[];
  freshness: boolean;
  resultCount: number;
  domains?: string[];
  category?: string | null;
  location?: string | null;
  contentNeeded: WebRetrievalContentNeed;
  query: string;
  carrySubject: boolean;
  /** Automatic escalation ladder — never user-prompted. */
  escalationChain: WebRetrievalPlanMode[];
  exaMode: ExaRetrievalMode | null;
  systemPrompt: string;
};

const PLAN_ESCALATION: WebRetrievalPlanMode[] = [
  "fast",
  "auto",
  "deep-lite",
  "deep",
  "agent",
];

function mapExaModeToPlan(mode: ExaRetrievalMode): WebRetrievalPlanMode {
  if (mode === "instant") return "fast";
  if (mode === "deep-reasoning") return "deep";
  return mode as WebRetrievalPlanMode;
}

function planModeToExa(mode: WebRetrievalPlanMode): ExaRetrievalMode | null {
  switch (mode) {
    case "fast":
      return "fast";
    case "auto":
      return "auto";
    case "deep-lite":
      return "deep-lite";
    case "deep":
      return "deep";
    case "agent":
      return null;
    default:
      return null;
  }
}

function extractDomains(content: string): string[] {
  const urls = content.match(/https?:\/\/[^\s)>"']+/gi) ?? [];
  const domains: string[] = [];
  for (const u of urls) {
    try {
      domains.push(new URL(u).hostname.replace(/^www\./, ""));
    } catch {
      // skip
    }
  }
  return [...new Set(domains)];
}

function extractLocation(
  content: string,
  conv?: ConversationTurnState | null,
): string | null {
  if (conv?.constraints.location) return conv.constraints.location;
  if (conv?.constraints.geography) return conv.constraints.geography;
  const m = content.match(
    /\b(in|near|around)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
  );
  return m?.[2] ?? null;
}

/** Compile the retrieval plan for this turn from TurnTask + conversation state. */
export function compileWebRetrievalPlan(opts: {
  content: string;
  turnTask: TurnTaskResolution;
  conv?: ConversationTurnState | null;
  turnRelation?: TurnRelation;
  carrySubject?: boolean;
  deeper?: boolean;
  escalate?: ExaRetrievalMode | null;
  temporalGrounding?: TemporalGrounding | null;
}): WebRetrievalPlan {
  const content = (opts.content || "").trim();
  const carrySubject =
    opts.carrySubject ??
    (opts.turnRelation !== "topic_switch" && Boolean(opts.turnTask.subject));
  const hints: TurnRetrievalHints = {
    subject: carrySubject ? opts.turnTask.subject : null,
    operation: opts.turnTask.operation,
    requestedFields: opts.turnTask.requestedFields,
    requestedItemCount: opts.turnTask.requestedItemCount,
    freshness:
      opts.turnTask.freshness ||
      Boolean(opts.conv?.freshnessRequirement) ||
      Boolean(opts.temporalGrounding?.freshnessRequired),
    depth: opts.turnTask.depth,
    presentation: opts.turnTask.presentation,
    dissatisfaction: Boolean(opts.conv?.dissatisfactionSignal),
  };

  const needsRetrieval =
    requiresExternalEvidence(content) ||
    opts.turnTask.retrievalNeeded ||
    Boolean(opts.conv?.externalRetrievalRequired) ||
    Boolean(opts.temporalGrounding?.timeSensitive);

  if (wantsAutonomousResearch(content)) {
    return {
      mode: "agent",
      output: "text",
      requestedFields: opts.turnTask.requestedFields,
      freshness: hints.freshness ?? false,
      resultCount: 0,
      domains: extractDomains(content),
      category: null,
      location: extractLocation(content, opts.conv),
      contentNeeded: "subpages",
      query: maybeAnchorRetrievalQuery(
        buildRetrievalQuery({
          content,
          subject: carrySubject ? opts.turnTask.subject : null,
          requestedFields: opts.turnTask.requestedFields,
          operation: opts.turnTask.operation,
          carrySubject,
        }),
        opts.temporalGrounding,
      ),
      carrySubject,
      escalationChain: ["agent"],
      exaMode: null,
      systemPrompt: "",
    };
  }

  // Explicit website inspect/summarize — owned by web.read / FETCH_URL, not Exa agent.
  const exactUrl = extractRequestedUrl(content);
  if (exactUrl && isExplicitWebsiteInspectRequest(content)) {
    return {
      mode: "none",
      output: "text",
      requestedFields: opts.turnTask.requestedFields,
      freshness: false,
      resultCount: 0,
      domains: [exactUrl.domain],
      category: null,
      location: extractLocation(content, opts.conv),
      contentNeeded: "full_text",
      query: exactUrl.url,
      carrySubject,
      escalationChain: [],
      exaMode: null,
      systemPrompt: "",
    };
  }

  if (!needsRetrieval && !opts.conv?.externalRetrievalRequired) {
    return {
      mode: "none",
      output: "text",
      requestedFields: opts.turnTask.requestedFields,
      freshness: false,
      resultCount: 0,
      contentNeeded: "highlights",
      query: content.slice(0, 400),
      carrySubject,
      escalationChain: [],
      exaMode: null,
      systemPrompt: "",
    };
  }

  const policy = resolveExaRetrievalPolicy(content, {
    deeper: opts.deeper,
    escalate: opts.escalate ?? undefined,
    hints,
  });
  const schema = buildExaOutputSchema(content, hints);
  const planMode = mapExaModeToPlan(policy.mode);
  const startIdx = PLAN_ESCALATION.indexOf(planMode);
  const escalationChain: WebRetrievalPlanMode[] =
    startIdx >= 0
      ? PLAN_ESCALATION.slice(startIdx)
      : (["fast", "auto", "deep-lite", "deep"] as WebRetrievalPlanMode[]);

  let contentNeeded: WebRetrievalContentNeed = "highlights";
  if (planMode === "deep" || planMode === "agent") contentNeeded = "subpages";
  else if (hints.operation === "detail" || hints.depth === "detailed") {
    contentNeeded = "full_text";
  }

  return {
    mode: planMode,
    output: schema.type === "object" ? "object" : "text",
    requestedFields: opts.turnTask.requestedFields,
    freshness: hints.freshness ?? false,
    resultCount: policy.numResults,
    domains: extractDomains(content),
    category: opts.conv?.constraints.industry ?? opts.conv?.constraints.category ?? null,
    location: extractLocation(content, opts.conv),
    contentNeeded,
    query: maybeAnchorRetrievalQuery(
      buildRetrievalQuery({
        content,
        subject: carrySubject ? opts.turnTask.subject : null,
        requestedFields: opts.turnTask.requestedFields,
        operation: opts.turnTask.operation,
        carrySubject,
      }),
      opts.temporalGrounding,
    ),
    carrySubject,
    escalationChain,
    exaMode: planModeToExa(planMode),
    systemPrompt: policy.systemPrompt,
  };
}

/** Next plan mode after quality gate failure. */
export function nextPlanEscalation(
  current: WebRetrievalPlanMode,
): WebRetrievalPlanMode | null {
  const idx = PLAN_ESCALATION.indexOf(current);
  if (idx < 0 || idx >= PLAN_ESCALATION.length - 1) return null;
  return PLAN_ESCALATION[idx + 1]!;
}
