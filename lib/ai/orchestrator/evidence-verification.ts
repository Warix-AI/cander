/**
 * Post-retrieval evidence verification — entity, date, freshness, authority.
 */

import type { TaskNode } from "./task-graph.ts";
import type { TurnEvidence } from "./evidence.ts";
import type { TemporalGrounding } from "./temporal-grounding.ts";
import type { TurnTaskResolution } from "../turn-environment/turn-task.ts";
import type { ProvenanceAtom } from "../turn-environment/normalize.ts";
import type { MessageCitation } from "./collect-citations.ts";

export const MAX_DISPLAY_CITATIONS = 3;

export type EvidenceVerificationResult = {
  verified: boolean;
  reason?: string;
  issues: string[];
  needsVerificationSearch: boolean;
  refinedQuery?: string;
  authorityScore: number;
};

const OFFICIAL_DOMAIN_RE =
  /\.(gov|edu)(\.[a-z]{2})?$|^(www\.)?(nba|nfl|mlb|nhl|espn|reuters|apnews|bbc)\./i;

const SECONDARY_DOMAIN_RE =
  /wikipedia|reddit|quora|pinterest|facebook|twitter|x\.com/i;

function domainFromUrl(url?: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function scoreSourceAuthority(url?: string | null, title?: string): number {
  const domain = domainFromUrl(url);
  const label = `${domain} ${title ?? ""}`.toLowerCase();
  if (!domain && !title) return 0;
  if (/\.gov(\.[a-z]{2})?$/i.test(domain)) return 95;
  if (OFFICIAL_DOMAIN_RE.test(domain) || /\bofficial\b/i.test(label)) return 100;
  if (SECONDARY_DOMAIN_RE.test(domain)) return 25;
  if (/\.edu(\.[a-z]{2})?$/i.test(domain)) return 85;
  if (/\.org$/i.test(domain)) return 70;
  return 50;
}

function extractYears(text: string): number[] {
  const years: number[] = [];
  for (const m of text.matchAll(/\b(19|20)\d{2}\b/g)) {
    years.push(Number(m[0]));
  }
  return years;
}

function entityTokens(subject: string | null | undefined, query: string): string[] {
  const raw = [subject, query]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  return [...new Set(raw)].slice(0, 8);
}

function combinedEvidenceText(items: TurnEvidence[]): string {
  return items.map((e) => `${e.title} ${e.content}`).join(" ");
}

function hasEntityMatch(tokens: string[], text: string): boolean {
  if (!tokens.length) return true;
  const lower = text.toLowerCase();
  const hits = tokens.filter((t) => lower.includes(t)).length;
  return hits >= Math.min(2, tokens.length) || (tokens.length === 1 && hits === 1);
}

function checkTemporalFreshness(
  text: string,
  grounding: TemporalGrounding,
): string | null {
  const years = extractYears(text);
  if (!years.length) {
    if (grounding.freshnessRequired) return "missing_date_anchor";
    return null;
  }
  const maxYear = Math.max(...years);
  const minYear = Math.min(...years);

  if (grounding.resolvedPhrases.some((p) => p.phrase === "last year")) {
    const target = grounding.year - 1;
    if (!years.includes(target)) return "wrong_year";
    if (maxYear > grounding.year) return "future_year";
    return null;
  }

  if (grounding.freshnessRequired && maxYear < grounding.year - 1) {
    return "stale_year";
  }
  if (grounding.freshnessRequired && minYear < grounding.year - 2 && !years.includes(grounding.year)) {
    return "stale_year";
  }
  return null;
}

function checkRelevance(node: TaskNode, text: string): boolean {
  const qWords = (node.query ?? node.label)
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  if (!qWords.length) return text.length >= 40;
  const hits = qWords.filter((w) => text.toLowerCase().includes(w)).length;
  return hits >= Math.min(2, qWords.length);
}

export function verifyEvidenceForTask(opts: {
  node: TaskNode;
  evidence: TurnEvidence[];
  grounding: TemporalGrounding;
  turnTask?: TurnTaskResolution;
}): EvidenceVerificationResult {
  const { node, evidence, grounding, turnTask } = opts;
  const nodeId = node.subtaskId ?? node.id;
  const items = evidence.filter(
    (e) =>
      e.ok &&
      e.content.trim() &&
      (e.subtaskId === nodeId ||
        e.id.startsWith(`st_${nodeId}_`) ||
        e.id.includes(nodeId)),
  );

  const issues: string[] = [];

  if (!items.length) {
    return {
      verified: false,
      reason: "no_evidence",
      issues: ["no_evidence"],
      needsVerificationSearch: false,
      refinedQuery: buildRefinedQuery(node, grounding, "official source"),
      authorityScore: 0,
    };
  }

  const text = combinedEvidenceText(items);
  const tokens = entityTokens(turnTask?.subject ?? null, node.query ?? node.label);

  if (!hasEntityMatch(tokens, text)) {
    issues.push("entity_mismatch");
  }
  if (!checkRelevance(node, text)) {
    issues.push("low_relevance");
  }

  const temporalIssue = checkTemporalFreshness(text, grounding);
  if (temporalIssue) issues.push(temporalIssue);

  const authorityScore = Math.max(
    ...items.map((e) => scoreSourceAuthority(e.url, e.title)),
    0,
  );
  if (grounding.timeSensitive && authorityScore < 50) {
    issues.push("low_authority");
  }

  const direct = items.find(
    (e) => e.kind === "exa_synthesis" && e.content.trim().length >= 12,
  );
  const hasNumericFact = /\d/.test(text) && text.length >= 40;

  if (!direct && !hasNumericFact && items.every((e) => e.kind === "search_result")) {
    issues.push("snippets_only");
  }

  const conflicting =
    grounding.freshnessRequired &&
    extractYears(text).filter((y) => y >= grounding.year - 3).length >= 2 &&
    new Set(extractYears(text)).size >= 2;
  if (conflicting) issues.push("conflicting_dates");

  const verified =
    issues.length === 0 &&
    (Boolean(direct) || hasNumericFact || text.length >= 80);

  const needsVerificationSearch =
    !verified &&
    (issues.includes("conflicting_dates") ||
      issues.includes("weak_evidence") ||
      issues.includes("stale_year") ||
      issues.includes("low_authority"));

  let refinedQuery: string | undefined;
  if (!verified) {
    if (issues.includes("snippets_only")) {
      refinedQuery = node.query;
    } else if (issues.includes("entity_mismatch")) {
      refinedQuery = buildRefinedQuery(
        node,
        grounding,
        `${turnTask?.subject ?? ""} official verified`.trim(),
      );
    } else if (issues.includes("stale_year") || issues.includes("wrong_year")) {
      refinedQuery = buildRefinedQuery(node, grounding, `${grounding.year} current official`);
    } else if (issues.includes("low_authority")) {
      refinedQuery = buildRefinedQuery(node, grounding, "official primary source");
    } else if (needsVerificationSearch) {
      refinedQuery = buildRefinedQuery(node, grounding, "verify official source");
    } else {
      refinedQuery = buildRefinedQuery(node, grounding, "official verified source");
    }
  }

  return {
    verified,
    reason: verified ? undefined : issues[0],
    issues,
    needsVerificationSearch,
    refinedQuery,
    authorityScore,
  };
}

function buildRefinedQuery(
  node: TaskNode,
  grounding: TemporalGrounding,
  suffix: string,
): string {
  const base = (node.query ?? node.label).trim();
  const anchor = grounding.queryAnchors[0];
  const parts = [base, anchor, suffix].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").slice(0, 400);
}

export function rankProvenanceAtoms(atoms: ProvenanceAtom[]): ProvenanceAtom[] {
  return [...atoms].sort((a, b) => {
    const sa = scoreSourceAuthority(a.url, a.title);
    const sb = scoreSourceAuthority(b.url, b.title);
    if (sb !== sa) return sb - sa;
    const exaA = a.kind === "exa_synthesis" ? 1 : 0;
    const exaB = b.kind === "exa_synthesis" ? 1 : 0;
    return exaB - exaA;
  });
}

export function capDisplayCitations<T>(citations: T[], max = MAX_DISPLAY_CITATIONS): T[] {
  return citations.slice(0, max);
}

export function rankAndCapCitations(citations: MessageCitation[]): MessageCitation[] {
  const ranked = [...citations].sort((a, b) => {
    const sa = scoreSourceAuthority(a.url, a.title);
    const sb = scoreSourceAuthority(b.url, b.title);
    return sb - sa;
  });
  return capDisplayCitations(ranked);
}
