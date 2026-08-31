/**
 * Stage 7 — Knowledge policy engine + unmatched defaults.
 */

import type {
  KnowledgePolicy,
  NormalizedRequest,
  Request,
  SourcePlan,
  SourceType,
} from "../types.ts";

export const POLICY_TABLE: KnowledgePolicy[] = [
  {
    key: "company.current_ceo",
    volatility: "changing",
    allowedSources: ["web", "knowledge_base"],
    preferredSources: ["web"],
    requiresExternalEvidence: true,
    modelAllowed: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
  {
    key: "company.board_members",
    volatility: "changing",
    allowedSources: ["web", "knowledge_base"],
    preferredSources: ["web"],
    requiresExternalEvidence: true,
    modelAllowed: false,
  },
  {
    key: "company.current_share_price",
    volatility: "live",
    allowedSources: ["web"],
    preferredSources: ["web"],
    requiresExternalEvidence: true,
    modelAllowed: false,
    maxAge: 60 * 60 * 1000,
  },
  {
    key: "nutrition.calories",
    volatility: "stable",
    allowedSources: ["web", "deterministic"],
    preferredSources: ["web"],
    requiresExternalEvidence: true,
    modelAllowed: false,
  },
  {
    key: "person.age",
    volatility: "changing",
    allowedSources: ["web"],
    preferredSources: ["web"],
    requiresExternalEvidence: true,
    modelAllowed: false,
  },
  {
    key: "concept.photosynthesis",
    volatility: "stable",
    allowedSources: ["model", "web"],
    preferredSources: ["model"],
    requiresExternalEvidence: false,
    modelAllowed: true,
  },
  {
    key: "concept.explanation",
    volatility: "stable",
    allowedSources: ["model", "web"],
    preferredSources: ["model"],
    requiresExternalEvidence: false,
    modelAllowed: true,
  },
  {
    key: "policy.refund",
    volatility: "changing",
    allowedSources: ["knowledge_base", "web", "memory"],
    preferredSources: ["knowledge_base", "web"],
    requiresExternalEvidence: true,
    modelAllowed: false,
  },
  {
    key: "policy.pto",
    volatility: "changing",
    allowedSources: ["knowledge_base", "memory"],
    preferredSources: ["knowledge_base"],
    requiresExternalEvidence: true,
    modelAllowed: false,
  },
  {
    key: "event.date",
    volatility: "live",
    allowedSources: ["web"],
    preferredSources: ["web"],
    requiresExternalEvidence: true,
    modelAllowed: false,
  },
  {
    key: "event.venue",
    volatility: "live",
    allowedSources: ["web"],
    preferredSources: ["web"],
    requiresExternalEvidence: true,
    modelAllowed: false,
  },
  {
    key: "geography.elevation",
    volatility: "stable",
    allowedSources: ["model", "web"],
    preferredSources: ["model"],
    requiresExternalEvidence: false,
    modelAllowed: true,
  },
  {
    key: "weather.current",
    volatility: "live",
    allowedSources: ["web"],
    preferredSources: ["web"],
    requiresExternalEvidence: true,
    modelAllowed: false,
    maxAge: 60 * 60 * 1000,
  },
];

function findPolicy(key?: string): KnowledgePolicy | undefined {
  if (!key) return undefined;
  return POLICY_TABLE.find((p) => p.key === key);
}

/** Unmatched defaults — never assume model-safe. */
export function unmatchedSourcePlan(
  n: NormalizedRequest,
): SourcePlan {
  const req = n.request;
  const internal =
    Boolean(req.qualifiers?.internal) ||
    /our\s+|handbook|internal/i.test(
      `${subjectText(req)} ${n.property.raw || ""}`,
    );

  if (req.kind === "calculate") {
    return {
      strategy: "deterministic",
      reason: "calculate_unmatched_default",
      matchedPolicy: false,
    };
  }

  if (req.kind === "explain" || req.kind === "summarize") {
    return {
      strategy: "model",
      reason: "conceptual_unmatched_default",
      matchedPolicy: false,
    };
  }

  if (req.kind === "research") {
    return {
      strategy: "hybrid",
      reason: "research_unmatched_default",
      matchedPolicy: false,
    };
  }

  if (internal) {
    return {
      strategy: "knowledge_base",
      reason: "internal_unmatched_default",
      matchedPolicy: false,
    };
  }

  // Freshness-sensitive / external factual
  if (
    /current|now|today|price|ceo|live/i.test(
      `${n.property.raw || ""} ${subjectText(req)}`,
    ) ||
    req.kind === "fact"
  ) {
    return {
      strategy: "web",
      reason: "external_fact_unmatched_default",
      matchedPolicy: false,
    };
  }

  return {
    strategy: "web",
    reason: "conservative_unmatched_default",
    matchedPolicy: false,
  };
}

function subjectText(req: Request): string {
  if (!req.subject) return "";
  if (req.subject.type === "named") return req.subject.value;
  if (req.subject.type === "context") return req.subject.ref;
  return req.subject.requestId;
}

export function planSource(n: NormalizedRequest): SourcePlan {
  if (n.request.kind === "calculate" && n.request.expression) {
    return {
      strategy: "deterministic",
      reason: "calculate_expression",
      matchedPolicy: true,
      policyKey: "calc",
    };
  }

  if (
    n.request.kind === "compare" &&
    (n.request.dependencies?.length || 0) >= 1
  ) {
    return {
      strategy: "model",
      reason: "compare_from_resolved_deps",
      matchedPolicy: true,
      policyKey: "compare",
    };
  }

  const policy = findPolicy(n.property.canonicalKey);
  if (!policy) return unmatchedSourcePlan(n);

  const internal =
    Boolean(n.request.qualifiers?.internal) ||
    /our\s+|handbook|internal/i.test(
      `${subjectText(n.request)} ${n.property.raw || ""}`,
    );

  const externalNamed =
    n.request.subject?.type === "named" &&
    /^(amazon|apple|tesla|google|microsoft|byu|utah)\b/i.test(
      n.request.subject.value.trim(),
    );

  let strategy: SourceType = policy.preferredSources[0] || policy.allowedSources[0]!;

  if (internal && policy.allowedSources.includes("knowledge_base")) {
    strategy = "knowledge_base";
  } else if (
    externalNamed &&
    policy.allowedSources.includes("web") &&
    !internal
  ) {
    strategy = "web";
  }

  return {
    strategy,
    reason: `policy:${policy.key}:${policy.volatility}`,
    policyKey: policy.key,
    matchedPolicy: true,
  };
}

export function getPolicy(key?: string): KnowledgePolicy | undefined {
  return findPolicy(key);
}
