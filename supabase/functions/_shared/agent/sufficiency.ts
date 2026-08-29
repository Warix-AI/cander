/**
 * Deterministic sufficiency checks before any model "judge".
 * Keep in sync with lib/ai/orchestrator/sufficiency.ts
 */

import type { RetrievalSource } from "./types.ts";

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

export type SufficiencyResult = {
  sufficient: boolean;
  reason: string;
  overlap: number;
};

export function checkRetrievalSufficiency(opts: {
  query: string;
  sources: RetrievalSource[];
}): SufficiencyResult {
  const { query, sources } = opts;
  if (!sources.length) {
    return { sufficient: false, reason: "zero_results", overlap: 0 };
  }

  const q = tokens(query);
  if (q.size === 0) {
    return { sufficient: true, reason: "empty_query_tokens", overlap: 1 };
  }

  let best = 0;
  for (const s of sources) {
    const blob = `${s.title} ${s.snippet ?? ""} ${s.url ?? ""}`;
    const st = tokens(blob);
    let hit = 0;
    for (const t of q) {
      if (st.has(t)) hit++;
    }
    best = Math.max(best, hit / q.size);
  }

  // Entity / topic presence: require modest lexical overlap
  if (best < 0.15) {
    return {
      sufficient: false,
      reason: "poor_lexical_overlap",
      overlap: best,
    };
  }

  // Explicit CEO / person role queries need a name-like signal in snippets
  if (/\bceo\b|\bfounder\b|\bpresident\b/i.test(query)) {
    const joined = sources.map((s) => `${s.title} ${s.snippet ?? ""}`).join(" ");
    const hasPersonish =
      /\b(ceo|chief executive|founder|president)\b/i.test(joined) ||
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(joined);
    if (!hasPersonish) {
      return {
        sufficient: false,
        reason: "missing_requested_entity",
        overlap: best,
      };
    }
  }

  return { sufficient: true, reason: "ok", overlap: best };
}
