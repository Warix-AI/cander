/**
 * Compress and select search/page evidence for synthesis.
 * Prefer authority, relevance, and diversity — never dump raw Exa results.
 */

import {
  ANSWER_SHAPE_BUDGETS,
  type AnswerShape,
  type CompactEvidenceItem,
  type EvidenceBudgetProfile,
} from "./types.ts";

export type RawEvidenceInput = {
  id: string;
  title?: string | null;
  url?: string | null;
  content?: string | null;
  kind?: string | null;
  ok?: boolean;
};

const NOISE_LINE =
  /^(home|menu|skip to|cookie|privacy|subscribe|sign in|log in|advertisement|related articles|share this|follow us|all rights reserved)/i;

function domainFromUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Generic authority score — not query-type specific. */
export function authorityScore(url: string | null | undefined, title?: string): number {
  const host = domainFromUrl(url);
  let score = 0.4;
  if (!host) return score;
  if (/\.(gov|edu|int)(\.|$)/i.test(host) || host.endsWith(".gov") || host.endsWith(".edu")) {
    score += 0.45;
  }
  if (
    /wikipedia\.org|britannica\.com|reuters\.com|apnews\.com|bbc\.(com|co\.uk)|nytimes\.com|wsj\.com|nature\.com|science\.org|nih\.gov|who\.int|cdc\.gov|fda\.gov/i.test(
      host,
    )
  ) {
    score += 0.35;
  }
  if (/medium\.com|blogspot\.|wordpress\.|quora\.com|reddit\.com|pinterest\./i.test(host)) {
    score -= 0.2;
  }
  if (title && /\b(official|docs|documentation|about)\b/i.test(title)) score += 0.05;
  return Math.max(0, Math.min(1, score));
}

function tokenize(text: string): Set<string> {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "in",
    "for",
    "on",
    "is",
    "are",
    "was",
    "were",
    "with",
    "that",
    "this",
    "from",
    "as",
    "at",
    "by",
    "be",
    "it",
    "you",
    "your",
    "how",
    "what",
    "when",
    "where",
    "who",
    "which",
    "many",
    "much",
  ]);
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []) {
    if (!stop.has(w)) out.add(w);
  }
  return out;
}

function relevanceScore(question: string, text: string): number {
  const q = tokenize(question);
  if (!q.size) return 0.5;
  const t = tokenize(text);
  let hit = 0;
  for (const w of q) if (t.has(w)) hit += 1;
  return hit / q.size;
}

/** Strip HTML, nav, SEO fluff, repeated URLs. */
export function stripEvidenceNoise(raw: string): string {
  let text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lines = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 24 && !NOISE_LINE.test(l));
  // Deduplicate near-identical sentences
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(line);
  }
  return kept.join(" ").trim();
}

/** Keep sentences that overlap the question; fall back to leading slice. */
export function extractRelevantExcerpt(
  question: string,
  content: string,
  maxChars: number,
): string {
  const cleaned = stripEvidenceNoise(content);
  if (!cleaned) return "";
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= 2) return cleaned.slice(0, maxChars);

  const scored = sentences.map((s, i) => ({
    s,
    i,
    score: relevanceScore(question, s),
  }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const picked = scored
    .filter((x) => x.score > 0 || x.i < 2)
    .slice(0, 6)
    .sort((a, b) => a.i - b.i);

  let out = "";
  for (const p of picked.length ? picked : scored.slice(0, 3)) {
    if (out.length + p.s.length + 1 > maxChars) break;
    out = out ? `${out} ${p.s}` : p.s;
  }
  return (out || cleaned).slice(0, maxChars).trim();
}

function preferKind(kind: string | null | undefined): number {
  const k = (kind ?? "").toLowerCase();
  if (k.includes("page") || k === "web_page") return 0.25;
  if (k.includes("knowledge")) return 0.15;
  if (k.includes("search") || k === "search_result" || k === "web_search") return 0;
  return 0.05;
}

/**
 * Select + compress evidence for the synthesis model.
 * Dedupes by domain/canonical content; prefers pages over duplicate snippets.
 */
export function compressEvidenceForSynthesis(opts: {
  question: string;
  items: RawEvidenceInput[];
  shape: AnswerShape;
  profile?: EvidenceBudgetProfile;
}): CompactEvidenceItem[] {
  const profile = opts.profile ?? "onDevice";
  const budget = ANSWER_SHAPE_BUDGETS[profile];
  const maxItems = Math.min(opts.shape.maxEvidenceItems, budget.maxEvidenceItems);
  const maxExcerpt = budget.maxExcerptChars;

  const candidates: CompactEvidenceItem[] = [];
  for (const item of opts.items) {
    if (item.ok === false) continue;
    const content = String(item.content ?? "").trim();
    if (!content && !item.url) continue;
    const excerpt = extractRelevantExcerpt(opts.question, content, maxExcerpt);
    if (!excerpt && !item.title) continue;
    const url = item.url ?? null;
    const auth = authorityScore(url, item.title ?? undefined);
    const rel = relevanceScore(opts.question, `${item.title ?? ""} ${excerpt}`);
    const score = auth * 0.45 + rel * 0.4 + preferKind(item.kind) + (excerpt.length > 40 ? 0.05 : 0);
    candidates.push({
      id: item.id,
      title: String(item.title || domainFromUrl(url) || "Source").slice(0, 160),
      url,
      domain: domainFromUrl(url) || undefined,
      excerpt: excerpt || String(item.title ?? "").slice(0, maxExcerpt),
      kind: item.kind ?? undefined,
      authority: score,
    });
  }

  candidates.sort((a, b) => b.authority - a.authority);

  // Dedupe by domain (keep best) and near-duplicate excerpts
  const byDomain = new Set<string>();
  const byExcerpt = new Set<string>();
  const selected: CompactEvidenceItem[] = [];
  for (const c of candidates) {
    const dom = c.domain || c.url || c.id;
    const exKey = c.excerpt.toLowerCase().slice(0, 60);
    if (c.domain && byDomain.has(c.domain) && selected.length >= 2) {
      // Allow a second from same domain only if much more relevant
      continue;
    }
    if (byExcerpt.has(exKey)) continue;
    byDomain.add(String(dom));
    byExcerpt.add(exKey);
    selected.push(c);
    if (selected.length >= maxItems) break;
  }

  // Enforce total char budget
  let used = 0;
  const capped: CompactEvidenceItem[] = [];
  const charCap = Math.min(opts.shape.maxEvidenceChars, budget.maxEvidenceChars);
  for (const c of selected) {
    const cost = c.excerpt.length + c.title.length + 24;
    if (used + cost > charCap && capped.length > 0) break;
    const room = Math.max(80, charCap - used - 24);
    capped.push({
      ...c,
      excerpt: c.excerpt.slice(0, room),
    });
    used += Math.min(cost, room + c.title.length + 24);
  }
  return capped;
}

/** Further reduce for retry after context overflow. */
export function shrinkEvidenceForRetry(
  items: CompactEvidenceItem[],
): CompactEvidenceItem[] {
  return items.slice(0, Math.max(2, Math.ceil(items.length / 2))).map((c) => ({
    ...c,
    excerpt: c.excerpt.slice(0, Math.max(120, Math.floor(c.excerpt.length * 0.55))),
  }));
}
