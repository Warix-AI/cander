/**
 * Deterministic-first router — no planner on obvious turns.
 * Keep in sync with lib/ai/orchestrator/router.ts
 */

import type { DeterministicRoute } from "./types.ts";

const GREETING =
  /^(hi|hey|hello|yo|sup|howdy|good (morning|afternoon|evening))\b/i;
const THANKS = /^(thanks|thank you|thx|ty)\b/i;
const SIMPLE_MATH = /^(what('?s| is)\s+)?\d+\s*[\+\-\*\/x×]\s*\d+\s*\??$/i;
const REWRITE =
  /\b(rewrite|rephrase|summarize|shorten|expand|fix (grammar|spelling)|proofread)\b/i;
const EXPLAIN_CONCEPT =
  /\b(explain|what (is|are)|define|tell me about)\b[\s\S]{0,80}\b(recursion|algorithm|function|variable|api|http|json|typescript|react)\b/i;

const WEB_EXPLICIT =
  /\b(search|look\s*up|google|bing|brave)\b[\s\S]{0,40}\b(online|web|internet|the\s+web)\b/i;
const WEB_LIVE =
  /\b(latest|current|today'?s?|this\s+week|yesterday|breaking)\b[\s\S]{0,48}\b(news|weather|price|stock|score|headline|ceo|announce)/i;
const WEB_WHO_ENTITY =
  /\bwho\s+(is|are|was|were)\s+(the\s+)?(ceo|cto|cfo|founder|president|mayor|prime\s+minister)\b/i;
const WEB_NEWS = /\b(news|headlines?|weather|stock\s+price|box\s+score)\b/i;
const WEB_LOOKUP =
  /\b(look\s*up|search\s+for|find\s+out|google)\b/i;

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
  if (CLIENT_WORKSPACE.test(t) && !WEB_LIVE.test(t)) {
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

  if (
    WEB_EXPLICIT.test(t) ||
    WEB_LIVE.test(t) ||
    WEB_WHO_ENTITY.test(t) ||
    (WEB_NEWS.test(t) && (WEB_LOOKUP.test(t) || WEB_LIVE.test(t)))
  ) {
    return {
      kind: "web_retrieve",
      reason: "deterministic:explicit_or_live_web",
      needsWeb: true,
    };
  }

  // Unresolved public entity / mixed — planner may help; still prefer web for "who is CEO of X"
  if (WEB_WHO_ENTITY.test(t) || (AMBIGUOUS_PUBLIC.test(t) && UNKNOWN_ENTITY.test(t))) {
    return {
      kind: "web_retrieve",
      reason: "deterministic:unresolved_public_entity",
      needsWeb: true,
      ambiguous: true,
    };
  }

  if (AMBIGUOUS_PUBLIC.test(t) && t.split(/\s+/).length <= 12) {
    // Short factual "who/what is X" often needs web when model lacks knowledge
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

/** Expand planner JSON into a concrete route. */
export function applyPlannerDecision(raw: unknown): DeterministicRoute {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const action = String(obj.action ?? obj.kind ?? "answer").toLowerCase();
  if (action.includes("web") || action === "search") {
    return {
      kind: "web_retrieve",
      reason: "planner:web",
      needsWeb: true,
    };
  }
  if (action.includes("knowledge") || action.includes("internal")) {
    return {
      kind: "knowledge_retrieve",
      reason: "planner:knowledge",
      needsKnowledge: true,
    };
  }
  if (action.includes("client") || action.includes("tool")) {
    return {
      kind: "client_action",
      reason: "planner:client_action",
      clientActions: Array.isArray(obj.tools)
        ? obj.tools.map(String)
        : ["ui.ask_clarification"],
    };
  }
  return { kind: "answer_direct", reason: "planner:answer" };
}
