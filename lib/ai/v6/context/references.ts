/**
 * Resolve pronouns / vague phrases against context entities.
 */

import type { ContextEntity, ResolvedReference } from "../types.ts";

export function resolveReferences(
  text: string,
  entities: ContextEntity[],
): ResolvedReference[] {
  const refs: ResolvedReference[] = [];
  const companyPhrase = text.match(
    /\b(that\s+company|that\s+billing\s+company|the\s+company|that\s+one)\b/i,
  );
  if (companyPhrase) {
    const phrase = companyPhrase[0]!;
    const companies = entities.filter(
      (e) => !e.kind || e.kind === "company" || e.kind === "org",
    );
    if (companies.length === 1) {
      refs.push({
        phrase,
        status: "resolved",
        target: { id: companies[0]!.id, name: companies[0]!.name },
      });
    } else if (companies.length > 1) {
      refs.push({
        phrase,
        status: "ambiguous",
        candidates: companies.map((c, i) => ({
          id: c.id,
          name: c.name,
          score: 1 - i * 0.1,
        })),
      });
    } else {
      refs.push({ phrase, status: "unresolved" });
    }
  }
  return refs;
}

export function clarificationFromAmbiguity(
  refs: ResolvedReference[],
): {
  phrase: string;
  candidates?: string[];
  question: string;
} | null {
  const amb = refs.find((r) => r.status === "ambiguous");
  if (!amb) return null;
  const names = amb.candidates?.map((c) => c.name) ?? [];
  return {
    phrase: amb.phrase,
    candidates: names,
    question:
      names.length > 0
        ? `Which did you mean: ${names.join(" or ")}?`
        : `Which "${amb.phrase}" are you referring to?`,
  };
}
