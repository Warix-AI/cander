/**
 * Deterministic sufficiency — client mirror for tests.
 * Keep in sync with supabase/functions/_shared/agent/sufficiency.ts
 */

export type RetrievalSource = {
  id: string;
  title: string;
  url?: string | null;
  snippet?: string;
  kind: "web" | "knowledge" | "history";
};

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

export function checkRetrievalSufficiency(opts: {
  query: string;
  sources: RetrievalSource[];
}): { sufficient: boolean; reason: string; overlap: number } {
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

  if (best < 0.15) {
    return {
      sufficient: false,
      reason: "poor_lexical_overlap",
      overlap: best,
    };
  }

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
