/**
 * Deterministic-first router — client mirror for tests.
 * Keep in sync with supabase/functions/_shared/agent/router.ts
 */

import { detectLiveInformation } from "./policy.ts";

export type RouteKind =
  | "answer_direct"
  | "web_retrieve"
  | "knowledge_retrieve"
  | "client_action"
  | "planner";

export type DeterministicRoute = {
  kind: RouteKind;
  reason: string;
  clientActions?: string[];
  needsWeb?: boolean;
  needsKnowledge?: boolean;
  ambiguous?: boolean;
};

const GREETING =
  /^(hi|hey|hello|yo|sup|howdy|good (morning|afternoon|evening))\b/i;
const THANKS = /^(thanks|thank you|thx|ty)\b/i;
const SIMPLE_MATH = /^(what('?s| is)\s+)?\d+\s*[\+\-\*\/x×]\s*\d+\s*\??$/i;
const REWRITE =
  /\b(rewrite|rephrase|summarize|shorten|expand|fix (grammar|spelling)|proofread)\b/i;
const EXPLAIN_CONCEPT =
  /\b(explain|what (is|are)|define|tell me about)\b[\s\S]{0,80}\b(recursion|algorithm|function|variable|api|http|json|typescript|react)\b/i;

const KNOWLEDGE =
  /\b(knowledge\s*bases?|internal\s+docs?|our\s+(pricing|policy|policies|customers?))\b/i;
const OUR_PRICING =
  /\b(what('?s| is)|whats)\b[\s\S]{0,48}\b(our|the)\b[\s\S]{0,24}\b(pricing|price|rates?|policy|policies)\b/i;

const CLIENT_NAV =
  /\b(open|go to|take me|navigate|switch to)\b[\s\S]{0,48}\b(build|explore|work|settings|connectors|recents|chat|project)\b/i;
const CLIENT_PROJECT =
  /\b(create|make|new|start)\b[\s\S]{0,40}\bproject\b/i;
const CLIENT_WORKSPACE =
  /\b(what|which|any)\b[\s\S]{0,48}\bprojects?\b/i;

const AMBIGUOUS_PUBLIC =
  /\bwho\s+is\b|\bwhat\s+is\b|\bwhere\s+is\b|\bwhen\s+(did|was|is)\b/i;
const UNKNOWN_ENTITY =
  /\b(acme|whatever|xyz|foobar|example\.com)\b/i;

export function routeDeterministic(content: string): DeterministicRoute {
  const t = content.trim();
  if (!t) {
    return { kind: "answer_direct", reason: "deterministic:empty" };
  }

  if (GREETING.test(t) || THANKS.test(t) || SIMPLE_MATH.test(t)) {
    return { kind: "answer_direct", reason: "deterministic:stable_simple" };
  }
  if (REWRITE.test(t) || EXPLAIN_CONCEPT.test(t)) {
    return { kind: "answer_direct", reason: "deterministic:rewrite_or_explain" };
  }

  const live = detectLiveInformation(t);
  if (live.needsWeb) {
    return {
      kind: "web_retrieve",
      reason: `deterministic:${live.reason}`,
      needsWeb: true,
    };
  }

  if (
    /\b(this|the|that)\s+(page|website|site|preview|screen|tab|window|viewport|ui|layout|button)\b/i.test(
      t,
    ) ||
    /\b(on|to)\s+the\s+right\b/i.test(t) ||
    /\b(my|the)\s+screen\b/i.test(t) ||
    /\bcan\s+you\s+see\b[\s\S]{0,40}\b(screen|page|right|preview|this|what)\b/i.test(
      t,
    ) ||
    /\b(see|look\s+at|describe|summarize|read)\b[\s\S]{0,48}\b(the\s+)?(page|website|preview|screen|right\s+panel)\b/i.test(
      t,
    )
  ) {
    return {
      kind: "client_action",
      reason: "deterministic:active_browser_context",
      clientActions: ["browser.current.get_context"],
    };
  }

  if (CLIENT_PROJECT.test(t)) {
    return {
      kind: "client_action",
      reason: "deterministic:project_create",
      clientActions: ["project.create"],
    };
  }
  if (CLIENT_NAV.test(t)) {
    return {
      kind: "client_action",
      reason: "deterministic:navigation",
      clientActions: ["nav.open"],
    };
  }
  if (CLIENT_WORKSPACE.test(t)) {
    return {
      kind: "client_action",
      reason: "deterministic:workspace_inventory",
      clientActions: ["workspace.search"],
      needsKnowledge: true,
    };
  }

  if (KNOWLEDGE.test(t) || OUR_PRICING.test(t)) {
    return {
      kind: "knowledge_retrieve",
      reason: "deterministic:internal_knowledge",
      needsKnowledge: true,
    };
  }

  if (AMBIGUOUS_PUBLIC.test(t) && UNKNOWN_ENTITY.test(t)) {
    return {
      kind: "web_retrieve",
      reason: "deterministic:unresolved_public_entity",
      needsWeb: true,
      ambiguous: true,
    };
  }

  if (AMBIGUOUS_PUBLIC.test(t) && t.split(/\s+/).length <= 12) {
    return {
      kind: "web_retrieve",
      reason: "deterministic:short_factual_lookup",
      needsWeb: true,
      ambiguous: true,
    };
  }

  if (AMBIGUOUS_PUBLIC.test(t) || /\band\b.+\b(also|plus)\b/i.test(t)) {
    return {
      kind: "planner",
      reason: "deterministic:ambiguous_mixed",
      ambiguous: true,
    };
  }

  return { kind: "answer_direct", reason: "deterministic:default_direct" };
}

export function isInternalResultBlob(content: string): boolean {
  return /^\s*Internal result for\b/i.test(content.trim());
}
