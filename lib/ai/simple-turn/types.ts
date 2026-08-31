/**
 * Compact state + plan types for the simple small-model turn runtime.
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

export type Lookup = {
  cap: Cap;
  q: string;
  /** Optional parallel group — same group may run together. */
  parallelGroup?: string;
};

export type AnswerShape =
  | "direct"
  | "breakdown"
  | "comparison"
  | "summary"
  | "steps"
  | "mixed";

/**
 * INTERPRET output — constrained plan before any tool executes.
 * `look` / `fresh` kept as aliases of `lookups` / `freshnessRequired`.
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
  /** @deprecated use freshnessRequired — kept in sync for callers */
  fresh: boolean;
  expectedEvidence: string[];
  answerShape: AnswerShape;
  lookups: Lookup[];
  /** @deprecated use lookups — kept in sync for callers */
  look?: Lookup[];
  answer?: string;
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
  /** VERIFY scores (0–1) when scored */
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
  repaired?: Plan;
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
};

export type AnswerPacket = {
  answer: string;
  topic?: string;
  entities?: string[];
  facts?: string[];
  path: "deterministic" | "fm_synthesis" | "unresolved";
};

export type SimpleTurnTerminal =
  | "ANSWERED_GROUNDED"
  | "ANSWERED_NO_RETRIEVAL_REQUIRED"
  | "UNRESOLVED"
  | "FAILED"
  | "PAUSED";

export function syncPlanAliases(plan: Plan): Plan {
  const lookups = plan.lookups?.length
    ? plan.lookups
    : plan.look?.length
      ? plan.look
      : [];
  const freshnessRequired = Boolean(
    plan.freshnessRequired || plan.fresh,
  );
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
