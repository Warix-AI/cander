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
};

export type Plan = {
  intent: string;
  asks: string[];
  constraints: string[];
  resolvedRefs: string[];
  unresolvedRefs: string[];
  fresh: boolean;
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
