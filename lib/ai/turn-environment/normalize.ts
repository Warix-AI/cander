/**
 * Provenance-preserving result normalizer.
 * Every evidence atom keeps sourceId through synthesis → renderer.
 */

import type { TurnEvidence } from "../orchestrator/evidence.ts";
import { newEvidenceId } from "../orchestrator/evidence.ts";

export type ProvenanceAtom = {
  sourceId: string;
  title: string;
  url?: string | null;
  domain?: string;
  excerpt: string;
  kind: string;
  sourceTool: string;
};

export type NormalizedToolPayload = {
  atoms: ProvenanceAtom[];
  evidence: TurnEvidence[];
  /** Sufficient for early synthesis (has usable snippets). */
  sufficient: boolean;
};

function domainFromUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

/**
 * Normalize web search / open tool data into provenance atoms + TurnEvidence.
 * Prefers citation excerpts when result descriptions are thin.
 */
export function normalizeWebSearchResult(opts: {
  toolName: string;
  ok: boolean;
  results?: Array<{
    title?: string;
    url?: string;
    description?: string;
    snippet?: string;
    id?: string;
  }>;
  citations?: Array<{
    id?: string;
    title?: string;
    url?: string;
    excerpt?: string;
    description?: string;
  }>;
}): NormalizedToolPayload {
  const atoms: ProvenanceAtom[] = [];
  const evidence: TurnEvidence[] = [];
  if (!opts.ok) {
    return { atoms, evidence, sufficient: false };
  }

  const citeByUrl = new Map<
    string,
    { id?: string; title?: string; url?: string; excerpt?: string; description?: string }
  >();
  for (const c of opts.citations ?? []) {
    const u = String(c?.url ?? "").trim().toLowerCase();
    if (u) citeByUrl.set(u, c);
  }

  const rows = opts.results?.length
    ? opts.results
    : (opts.citations ?? []).map((c) => ({
        title: c.title,
        url: c.url,
        description: c.excerpt || c.description,
        id: c.id,
      }));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const url = String(r.url ?? "").trim();
    if (!url) continue;
    const cite = citeByUrl.get(url.toLowerCase());
    const desc = String(
      r.description || r.snippet || cite?.excerpt || cite?.description || "",
    ).trim();
    const sourceId = String(r.id || cite?.id || newEvidenceId("src")).slice(
      0,
      80,
    );
    const title = String(r.title || cite?.title || url).slice(0, 200);
    const excerpt = clip(desc, 400);
    atoms.push({
      sourceId,
      title,
      url,
      domain: domainFromUrl(url),
      excerpt,
      kind: "search_result",
      sourceTool: opts.toolName,
    });
    evidence.push({
      id: sourceId,
      kind: "search_result",
      title,
      url,
      content: excerpt || title,
      retrievedAt: new Date().toISOString(),
      sourceTool: opts.toolName,
      ok: Boolean(excerpt || title),
    });
  }

  const sufficient = atoms.some((a) => a.excerpt.length >= 20);
  return { atoms, evidence, sufficient };
}

export function normalizeWebPageResult(opts: {
  toolName: string;
  ok: boolean;
  url?: string;
  finalUrl?: string;
  title?: string;
  text?: string;
  citationId?: string;
  error?: string;
}): NormalizedToolPayload {
  const url = String(opts.finalUrl || opts.url || "").trim();
  const sourceId = String(opts.citationId || newEvidenceId("page")).slice(0, 80);
  const text = String(opts.text ?? "").trim();
  const title = String(opts.title || url || "Page").slice(0, 200);
  if (!opts.ok || !url) {
    return {
      atoms: [],
      evidence: [
        {
          id: sourceId,
          kind: "web_page",
          title,
          url: url || null,
          content: "",
          retrievedAt: new Date().toISOString(),
          sourceTool: opts.toolName,
          ok: false,
          error: opts.error || "open_failed",
        },
      ],
      sufficient: false,
    };
  }
  const excerpt = clip(text, 1200);
  const atom: ProvenanceAtom = {
    sourceId,
    title,
    url,
    domain: domainFromUrl(url),
    excerpt,
    kind: "web_page",
    sourceTool: opts.toolName,
  };
  return {
    atoms: [atom],
    evidence: [
      {
        id: sourceId,
        kind: "web_page",
        title,
        url,
        content: excerpt,
        retrievedAt: new Date().toISOString(),
        sourceTool: opts.toolName,
        ok: Boolean(excerpt),
        error: excerpt ? undefined : opts.error,
      },
    ],
    sufficient: excerpt.length >= 40,
  };
}

/** Citations for Message.citations — retain sourceIds from atoms. */
export function citationsFromAtoms(
  atoms: ProvenanceAtom[],
): Array<{
  id: string;
  title: string;
  url: string;
  canonicalUrl?: string;
  domain?: string;
  excerpt?: string;
  retrievedAt?: string;
  sourceType?: string;
}> {
  const out: Array<{
    id: string;
    title: string;
    url: string;
    canonicalUrl?: string;
    domain?: string;
    excerpt?: string;
    retrievedAt?: string;
    sourceType?: string;
  }> = [];
  const seen = new Set<string>();
  for (const a of atoms) {
    if (!a.url) continue;
    const key = a.url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: a.sourceId,
      title: a.title,
      url: a.url,
      canonicalUrl: a.url,
      domain: a.domain,
      excerpt: a.excerpt.slice(0, 400) || undefined,
      retrievedAt: new Date().toISOString(),
      sourceType: a.kind,
    });
  }
  return out;
}

export function mergeProvenanceAtoms(
  batches: ProvenanceAtom[][],
): ProvenanceAtom[] {
  const out: ProvenanceAtom[] = [];
  const seen = new Set<string>();
  for (const batch of batches) {
    for (const a of batch) {
      const key = (a.url || a.sourceId).replace(/\/$/, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
  }
  return out;
}
