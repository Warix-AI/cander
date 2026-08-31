/**
 * Citations from Evidence only — model never invents citation IDs/URLs.
 */

import type { Evidence } from "../types.ts";

export type Citation = {
  id: string;
  title: string;
  url: string;
  excerpt?: string;
  sourceType?: string;
};

export function citationsFromEvidence(evidence: Evidence[]): Citation[] {
  const withUrl = evidence.filter((e) => e.source?.url);
  // Dedupe by URL
  const seen = new Set<string>();
  const ranked = [...withUrl].sort((a, b) => {
    const aa = Math.max(0, ...Object.values(a.scores).map((s) => s.authority));
    const bb = Math.max(0, ...Object.values(b.scores).map((s) => s.authority));
    return bb - aa;
  });

  const out: Citation[] = [];
  for (const e of ranked) {
    const url = e.source!.url!;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      id: e.id,
      title: e.source?.title || "Source",
      url,
      excerpt: e.excerpt,
      sourceType: e.sourceType,
    });
    if (out.length >= 5) break;
  }

  // KB without URL
  for (const e of evidence) {
    if (e.sourceType !== "knowledge_base") continue;
    if (out.some((c) => c.id === e.id)) continue;
    out.push({
      id: e.id,
      title: e.source?.title || "Knowledge base",
      url: e.source?.documentId
        ? `kb://${e.source.documentId}`
        : `kb://${e.id}`,
      excerpt: e.excerpt,
      sourceType: "knowledge_base",
    });
    if (out.length >= 8) break;
  }

  return out;
}
