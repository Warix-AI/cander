/**
 * Temporal grounding — resolve relative dates and inject turn clock context.
 */

import type { ConversationTurnState } from "../turn-environment/conversation-types.ts";
import type { TurnTaskResolution } from "../turn-environment/turn-task.ts";

export type ResolvedTemporalPhrase = {
  phrase: string;
  resolved: string;
};

export type TemporalGrounding = {
  nowIso: string;
  dateLabel: string;
  year: number;
  month: number;
  timezone: string;
  location: string | null;
  timeSensitive: boolean;
  freshnessRequired: boolean;
  resolvedPhrases: ResolvedTemporalPhrase[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  queryAnchors: string[];
  promptLine: string;
};

const TIME_SENSITIVE_RE =
  /\b(news|headline|score|game|schedule|price|cost|stock|weather|election|release|announce|today|tonight|this\s+(week|month|year|semester)|latest|current|now|as\s+of|when\s+(is|are|do|does)|what\s+time|opening\s+hours|ticker|market)\b/i;

const RELATIVE_PHRASE_RESOLVERS: Array<{
  re: RegExp;
  resolve: (now: Date, tz: string) => ResolvedTemporalPhrase | null;
}> = [
  {
    re: /\btoday\b/i,
    resolve: (now, tz) => ({
      phrase: "today",
      resolved: formatDateLabel(now, tz),
    }),
  },
  {
    re: /\btonight\b/i,
    resolve: (now, tz) => ({
      phrase: "tonight",
      resolved: `${formatDateLabel(now, tz)} (local evening)`,
    }),
  },
  {
    re: /\bthis\s+year\b/i,
    resolve: (now) => ({
      phrase: "this year",
      resolved: String(now.getFullYear()),
    }),
  },
  {
    re: /\blast\s+year\b/i,
    resolve: (now) => ({
      phrase: "last year",
      resolved: String(now.getFullYear() - 1),
    }),
  },
  {
    re: /\bthis\s+semester\b/i,
    resolve: (now) => ({
      phrase: "this semester",
      resolved: currentSemesterLabel(now),
    }),
  },
  {
    re: /\bthis\s+month\b/i,
    resolve: (now, tz) => ({
      phrase: "this month",
      resolved: formatMonthYear(now, tz),
    }),
  },
  {
    re: /\bthis\s+week\b/i,
    resolve: (now, tz) => ({
      phrase: "this week",
      resolved: `week of ${formatDateLabel(now, tz)}`,
    }),
  },
];

export function defaultTimezone(): string {
  try {
    if (typeof Intl !== "undefined") {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    }
  } catch {
    // fall through
  }
  return "UTC";
}

function formatDateLabel(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

function formatMonthYear(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "long",
    year: "numeric",
  }).format(d);
}

function isoDateInTimezone(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

function currentSemesterLabel(now: Date): string {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 8) return `Fall ${year}`;
  if (month >= 5) return `Summer ${year}`;
  return `Spring ${year}`;
}

function extractLocation(
  conv?: ConversationTurnState | null,
  content?: string,
): string | null {
  if (conv?.constraints.location) return String(conv.constraints.location);
  if (conv?.constraints.geography) return String(conv.constraints.geography);
  const m = (content ?? "").match(
    /\b(in|near|around)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
  );
  return m?.[2] ?? null;
}

export function isTimeSensitiveQuery(content: string): boolean {
  return TIME_SENSITIVE_RE.test(content);
}

export function resolveTemporalGrounding(opts: {
  content: string;
  now?: Date;
  timezone?: string;
  location?: string | null;
  conv?: ConversationTurnState | null;
}): TemporalGrounding {
  const now = opts.now ?? new Date();
  const timezone = opts.timezone ?? defaultTimezone();
  const location =
    opts.location ?? extractLocation(opts.conv, opts.content);
  const content = opts.content.trim();

  const resolvedPhrases: ResolvedTemporalPhrase[] = [];
  for (const { re, resolve } of RELATIVE_PHRASE_RESOLVERS) {
    if (!re.test(content)) continue;
    const r = resolve(now, timezone);
    if (r && !resolvedPhrases.some((x) => x.phrase === r.phrase)) {
      resolvedPhrases.push(r);
    }
  }

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const timeSensitive =
    isTimeSensitiveQuery(content) ||
    resolvedPhrases.length > 0 ||
    Boolean(opts.conv?.freshnessRequirement);

  const queryAnchors: string[] = [];
  if (resolvedPhrases.some((p) => p.phrase === "this year")) {
    queryAnchors.push(String(year));
  }
  if (resolvedPhrases.some((p) => p.phrase === "last year")) {
    queryAnchors.push(String(year - 1));
  }
  if (
    resolvedPhrases.some((p) =>
      ["today", "tonight", "this week", "this month"].includes(p.phrase),
    )
  ) {
    queryAnchors.push(formatMonthYear(now, timezone));
  }
  if (resolvedPhrases.some((p) => p.phrase === "this semester")) {
    queryAnchors.push(currentSemesterLabel(now));
  }

  let startPublishedDate: string | undefined;
  let endPublishedDate: string | undefined;
  if (resolvedPhrases.some((p) => p.phrase === "today" || p.phrase === "tonight")) {
    startPublishedDate = isoDateInTimezone(
      new Date(now.getTime() - 7 * 86400000),
      timezone,
    );
  } else if (resolvedPhrases.some((p) => p.phrase === "this year")) {
    startPublishedDate = `${year}-01-01`;
  } else if (resolvedPhrases.some((p) => p.phrase === "last year")) {
    startPublishedDate = `${year - 1}-01-01`;
    endPublishedDate = `${year - 1}-12-31`;
  } else if (timeSensitive) {
    startPublishedDate = isoDateInTimezone(
      new Date(now.getTime() - 14 * 86400000),
      timezone,
    );
  }

  const dateLabel = formatDateLabel(now, timezone);
  const phraseSummary =
    resolvedPhrases.length > 0
      ? resolvedPhrases.map((p) => `"${p.phrase}" → ${p.resolved}`).join("; ")
      : "none";

  const promptLine = [
    `Current date: ${dateLabel} (${timezone})`,
    `Current year: ${year}`,
    location ? `Location context: ${location}` : null,
    `Resolved relative time: ${phraseSummary}`,
    timeSensitive
      ? "Time-sensitive — use live retrieval; do not answer from training memory."
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    nowIso: now.toISOString(),
    dateLabel,
    year,
    month,
    timezone,
    location,
    timeSensitive,
    freshnessRequired: timeSensitive || resolvedPhrases.length > 0,
    resolvedPhrases,
    startPublishedDate,
    endPublishedDate,
    queryAnchors,
    promptLine,
  };
}

/** Apply temporal flags onto turn task resolution. */
export function applyTemporalToTurnTask(
  task: TurnTaskResolution,
  grounding: TemporalGrounding,
): TurnTaskResolution {
  if (!grounding.timeSensitive && !grounding.freshnessRequired) return task;
  return {
    ...task,
    freshness: task.freshness || grounding.freshnessRequired,
    retrievalNeeded: true,
  };
}

/** Anchor atomic retrieval query with resolved calendar context. */
export function anchorRetrievalQuery(
  query: string,
  grounding: TemporalGrounding,
): string {
  let q = query.trim();
  if (!q || !grounding.queryAnchors.length) return q.slice(0, 400);
  for (const anchor of grounding.queryAnchors) {
    if (new RegExp(anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(q)) {
      continue;
    }
    q = `${q} ${anchor}`.trim();
  }
  return q.slice(0, 400);
}

export function maybeAnchorRetrievalQuery(
  query: string,
  grounding?: TemporalGrounding | null,
): string {
  if (!grounding?.queryAnchors.length) return query.slice(0, 400);
  return anchorRetrievalQuery(query, grounding);
}

export function formatTemporalContextForPrompt(
  grounding: TemporalGrounding,
): string {
  return grounding.promptLine;
}
