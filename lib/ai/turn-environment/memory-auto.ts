/**
 * Automatic memory retrieval into the context packet.
 * Not a model-visible tool unless wantsDeepMemorySearch().
 */

import { wantsDeepMemorySearch } from "./state-resolver.ts";

const CALLBACK =
  /\b(earlier|before|previously|you said|we (talked|discussed)|last time|what about|that one|their|them|it)\b/i;

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 12);
}

/**
 * Pull a few relevant older turns into the packet (deduped, newest preferred).
 */
export function autoRetrieveMemorySnippets(opts: {
  content: string;
  messages?: Array<{ role: string; content: string }>;
  maxSnippets?: number;
}): string[] {
  const content = (opts.content || "").trim();
  const messages = opts.messages ?? [];
  if (!content || messages.length < 3) return [];
  // Deep explicit search stays a tool — don't auto-flood the packet.
  if (wantsDeepMemorySearch(content) && !CALLBACK.test(content)) {
    return [];
  }
  if (!CALLBACK.test(content) && !/\b(second|first|third|that|those)\b/i.test(content)) {
    return [];
  }

  const keys = keywords(content);
  if (!keys.length) return [];

  const older = messages.slice(0, -2);
  const scored = older.map((m, i) => {
    const body = String(m.content ?? "");
    const lower = body.toLowerCase();
    let score = 0;
    for (const k of keys) {
      if (lower.includes(k)) score += 1;
    }
    // Prefer newer among older turns
    score += i / Math.max(1, older.length) * 0.5;
    return { m, score, i };
  });
  scored.sort((a, b) => b.score - a.score || b.i - a.i);

  const out: string[] = [];
  const seen = new Set<string>();
  const max = opts.maxSnippets ?? 3;
  for (const row of scored) {
    if (row.score < 1) continue;
    const snippet = `${row.m.role}: ${String(row.m.content).slice(0, 280)}`;
    const key = snippet.slice(0, 80).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(snippet);
    if (out.length >= max) break;
  }
  return out;
}
