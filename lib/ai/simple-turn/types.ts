/**
 * Simple-turn types — INTERPRET produces IntentPlan (atomic intents).
 */

export type BrowserMode = "auto" | "on" | "off";

export type Cap =
  | "WEB"
  | "MEMORY"
  | "FILES"
  | "CALENDAR"
  | "EMAIL"
  | "CRM"
  | "CALC"
  | "BUILD";

export type IntentAction =
  | "ANSWER"
  | "WEB"
  | "MEMORY"
  | "FILES"
  | "CALENDAR"
  | "EMAIL"
  | "CRM"
  | "CALC"
  | "BUILD";

export type Lookup = {
  cap: Cap;
  q: string;
  parallelGroup?: string;
  /** Owning intent id when run from IntentPlan */
  intentId?: string;
  /** Prefer Exa deeper retrieval for this lookup — ignored; always type=deep */
  deeper?: boolean;
  /** Always forced to "deep" for open-web; kept for debug/override logging */
  retrievalMode?: string;
  /** @deprecated Mode escalation disabled — retry uses refined query + type=deep */
  escalate?: string;
};

export type AnswerShape =
  | "direct"
  | "breakdown"
  | "comparison"
  | "summary"
  | "steps"
  | "mixed";

export type IntentConditionOperator = "exists" | "equals" | "not_equals";

/** Gate a dependent intent on an upstream result (evaluated in code). */
export type IntentCondition = {
  intentId: string;
  operator: IntentConditionOperator;
  value?: string;
};

/** Fields a dependent intent needs extracted from an upstream intent's evidence. */
export type IntentNeedsFrom = {
  intentId: string;
  fields: string[];
};

/** Atomic normalized ask — one executable unit. */
export type Intent = {
  id: string;
  goal: string;
  action: IntentAction;
  entity?: string;
  subject?: string;
  quantity?: number;
  constraints: string[];
  resolvedRefs: string[];
  unresolvedRefs: string[];
  freshnessRequired: boolean;
  dependsOn: string[];
  condition?: IntentCondition;
  needsFrom?: IntentNeedsFrom;
  lookup?: { q: string };
};

/** INTERPRET output — clean intents before any tool call. */
export type IntentPlan = {
  overallIntent: string;
  intents: Intent[];
  /** Only when no tools needed (greeting / pure opinion). */
  answer?: string;
};

/**
 * Derived flat plan view for answer/verify helpers that still expect asks/lookups.
 * Prefer IntentPlan at the runtime boundary.
 */
export type Plan = {
  intent: string;
  asks: string[];
  constraints: string[];
  entities: string[];
  resolvedRefs: string[];
  unresolvedRefs: string[];
  temporalContext: string[];
  freshnessRequired: boolean;
  fresh: boolean;
  expectedEvidence: string[];
  answerShape: AnswerShape;
  lookups: Lookup[];
  look?: Lookup[];
  answer?: string;
  /** Source IntentPlan when available */
  intentPlan?: IntentPlan;
};

export type SimpleEvidence = {
  id: string;
  cap: Cap;
  query: string;
  title: string;
  url?: string | null;
  content: string;
  ok: boolean;
  accepted: boolean;
  rejectReason?: string;
  retrievedAt: string;
  sourceTool: string;
  cacheHit?: boolean;
  intentId?: string;
  verify?: EvidenceVerifyScore;
};

export type EvidenceVerifyScore = {
  entityOk: boolean;
  dateOk: boolean;
  freshnessOk: boolean;
  authority: number;
  answersAsk: boolean;
  conflicts: boolean;
  score: number;
  reasons: string[];
};

export type CommitNotes = {
  topic?: string;
  entities: string[];
  facts: string[];
};

export type SimpleAttachment = {
  name: string;
  kind: "text" | "image" | "other";
  preview?: string;
};

export type SimpleState = {
  text: string;
  attachments: SimpleAttachment[];
  browser: BrowserMode;
  now: { date: string; tz: string };
  notes: CommitNotes;
  cache: Map<string, SimpleEvidence>;
};

export type HydrateResult = {
  userText: string;
  resolved: string[];
  unresolved: string[];
  urls: Array<{ url: string; domain: string }>;
  temporalLine: string;
  year: number;
  topicHint?: string;
  entityHints: string[];
  planPrompt: string;
};

export type PlanValidation = {
  ok: boolean;
  issues: string[];
  repaired?: IntentPlan;
};

export type IntentResultStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "unresolved"
  | "BLOCKED_UPSTREAM_FAILED"
  | "SKIPPED_BY_CONDITION";

export type IntentResult = {
  intent: Intent;
  status: IntentResultStatus;
  evidence: SimpleEvidence[];
  accepted: SimpleEvidence[];
  rejectReason?: string;
  /** Fields pulled from upstream for needsFrom (deterministic, not free-form CoT). */
  needsPayload?: Record<string, string>;
};

export type CheckResult = {
  accepted: SimpleEvidence[];
  rejected: SimpleEvidence[];
  needsRefine: boolean;
  refineLookups?: Lookup[];
  needsCorroboration: boolean;
  corroborateLookups?: Lookup[];
  needsDeeperSearch: boolean;
  unresolved: boolean;
  unresolvedReason?: string;
  intentResults?: IntentResult[];
};

export type AnswerPacket = {
  answer: string;
  topic?: string;
  entities?: string[];
  facts?: string[];
  path: "deterministic" | "exa_deep" | "fm_synthesis" | "unresolved";
};

export type SimpleTurnTerminal =
  | "ANSWERED_GROUNDED"
  | "ANSWERED_NO_RETRIEVAL_REQUIRED"
  | "UNRESOLVED"
  | "FAILED"
  | "PAUSED";

const ACTIONS: IntentAction[] = [
  "ANSWER",
  "WEB",
  "MEMORY",
  "FILES",
  "CALENDAR",
  "EMAIL",
  "CRM",
  "CALC",
  "BUILD",
];

export function isIntentAction(v: unknown): v is IntentAction {
  return typeof v === "string" && (ACTIONS as string[]).includes(v);
}

export function actionToCap(action: IntentAction): Cap | null {
  if (action === "ANSWER") return null;
  return action;
}

export function syncPlanAliases(plan: Plan): Plan {
  const lookups = plan.lookups?.length
    ? plan.lookups
    : plan.look?.length
      ? plan.look
      : [];
  const freshnessRequired = Boolean(plan.freshnessRequired || plan.fresh);
  return {
    ...plan,
    entities: plan.entities ?? [],
    temporalContext: plan.temporalContext ?? [],
    expectedEvidence: plan.expectedEvidence ?? [],
    answerShape: plan.answerShape ?? "direct",
    freshnessRequired,
    fresh: freshnessRequired,
    lookups,
    look: lookups.length ? lookups : undefined,
  };
}

/** Flatten IntentPlan → Plan for answer synthesis / legacy helpers. */
export function intentPlanToPlan(ip: IntentPlan): Plan {
  const lookups: Lookup[] = [];
  const asks: string[] = [];
  const entities: string[] = [];
  const constraints: string[] = [];
  const resolvedRefs: string[] = [];
  const unresolvedRefs: string[] = [];
  let freshnessRequired = false;

  for (const intent of ip.intents) {
    asks.push(intent.goal);
    if (intent.entity) entities.push(intent.entity);
    constraints.push(...intent.constraints);
    resolvedRefs.push(...intent.resolvedRefs);
    unresolvedRefs.push(...(intent.unresolvedRefs ?? []));
    if (intent.freshnessRequired) freshnessRequired = true;
    const cap = actionToCap(intent.action);
    if (cap && intent.lookup?.q) {
      lookups.push({
        cap,
        q: intent.lookup.q,
        parallelGroup: intent.dependsOn.length ? `dep_${intent.id}` : "parallel",
        intentId: intent.id,
      });
    }
  }

  const answerShape: AnswerShape =
    ip.intents.some((i) => i.action === "CALC")
      ? "mixed"
      : ip.intents.length > 1
        ? "breakdown"
        : ip.intents.some((i) => /summar/i.test(i.goal))
          ? "summary"
          : "direct";

  return syncPlanAliases({
    intent: ip.overallIntent,
    asks: asks.length ? asks : [ip.overallIntent],
    constraints: [...new Set(constraints)],
    entities: [...new Set(entities)],
    resolvedRefs: [...new Set(resolvedRefs)],
    unresolvedRefs: [...new Set(unresolvedRefs)],
    temporalContext: [],
    freshnessRequired,
    fresh: freshnessRequired,
    expectedEvidence: asks.map((a) => `Verified fact for: ${a}`.slice(0, 200)),
    answerShape,
    lookups,
    answer: ip.answer,
    intentPlan: ip,
  });
}

const CONDITION_OPS: IntentConditionOperator[] = [
  "exists",
  "equals",
  "not_equals",
];

export function normalizeCondition(
  raw: IntentCondition | undefined,
): IntentCondition | undefined {
  if (!raw?.intentId?.trim()) return undefined;
  const operator = CONDITION_OPS.includes(raw.operator)
    ? raw.operator
    : "exists";
  return {
    intentId: String(raw.intentId).trim(),
    operator,
    value:
      typeof raw.value === "string" && raw.value.trim()
        ? raw.value.trim().slice(0, 200)
        : undefined,
  };
}

export function normalizeNeedsFrom(
  raw: IntentNeedsFrom | undefined,
): IntentNeedsFrom | undefined {
  if (!raw?.intentId?.trim()) return undefined;
  const fields = (raw.fields ?? [])
    .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    .map((f) => f.trim().slice(0, 80))
    .slice(0, 12);
  if (!fields.length) return undefined;
  return { intentId: String(raw.intentId).trim(), fields };
}

export function normalizeIntentPlan(ip: IntentPlan): IntentPlan {
  const intents = ip.intents.map((intent, i) => {
    const condition = normalizeCondition(intent.condition);
    const needsFrom = normalizeNeedsFrom(intent.needsFrom);
    // Implicit deps from condition / needsFrom for ordering
    const dependsOn = [
      ...(intent.dependsOn ?? []).map(String),
      ...(condition ? [condition.intentId] : []),
      ...(needsFrom ? [needsFrom.intentId] : []),
    ].filter((v, idx, arr) => arr.indexOf(v) === idx);

    return {
      ...intent,
      id: intent.id?.trim() || String(i + 1),
      goal: intent.goal.trim().slice(0, 300),
      constraints: intent.constraints ?? [],
      resolvedRefs: intent.resolvedRefs ?? [],
      unresolvedRefs: intent.unresolvedRefs ?? [],
      dependsOn,
      condition,
      needsFrom,
      freshnessRequired: Boolean(intent.freshnessRequired),
      lookup: intent.lookup?.q
        ? { q: intent.lookup.q.trim().slice(0, 400) }
        : undefined,
    };
  });
  return {
    overallIntent: ip.overallIntent.trim().slice(0, 400),
    intents,
    answer: ip.answer?.trim() ? ip.answer.trim().slice(0, 2000) : undefined,
  };
}
