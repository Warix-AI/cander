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

const PLAN_ESCALATION: WebRetrievalPlanMode[] = ["deep"];

function mapExaModeToPlan(_mode: ExaRetrievalMode): WebRetrievalPlanMode {
  return "deep";
}

function planModeToExa(mode: WebRetrievalPlanMode): ExaRetrievalMode | null {
  if (mode === "none" || mode === "agent") return null;
  return "deep";
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
    // Autonomous-sounding prompts still use Exa type=deep in normal chat —
    // no separate Agent mode until deliberately re-enabled.
    const policy = resolveExaRetrievalPolicy(content, {
      hints,
      webRetrievalMode: "deep_only",
    });
    return {
      mode: "deep",
      output: "text",
      requestedFields: opts.turnTask.requestedFields,
      freshness: hints.freshness ?? false,
      resultCount: policy.numResults,
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
      escalationChain: ["deep"],
      exaMode: "deep",
      systemPrompt: policy.systemPrompt,
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
    webRetrievalMode: "deep_only",
  });
  const schema = buildExaOutputSchema(content, hints);
  // Normal chat: Exa type=deep only — no mode ladder / agent fallback
  const planMode: WebRetrievalPlanMode = "deep";
  const escalationChain: WebRetrievalPlanMode[] = ["deep"];

  let contentNeeded: WebRetrievalContentNeed = "subpages";
  if (hints.operation === "detail" || hints.depth === "detailed") {
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
    exaMode: "deep",
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
