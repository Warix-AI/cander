/**
 * Client mirrors of V2 memory retrieval helpers for unit tests.
 */

export type WorkingMemoryLite = {
  activeEntity?: string;
  activeTopic?: string;
  recentLists?: Array<{
    id: string;
    items: Array<{ ordinal: number; label: string }>;
  }>;
  recentReferences?: string[];
  entities?: string[];
  topics?: string[];
  references?: Array<{ phrase: string; resolvesTo: string }>;
};

const PRONOUN_REF =
  /\b(that|this|it|them|those|their|they|he|she|his|her|its)\b/i;
const TEMPORAL_REF =
  /\b(what you said|you mentioned|you told|earlier|before|previously|last time|as you said|still true|is that still|did that change|what was that)\b/i;
const ORDINAL_REF =
  /\b(?:the\s+)?(first|second|third|fourth|fifth|\d+)(?:st|nd|rd|th)?\s+(?:one|item|result|story|article|option|choice|alternative)\b/i;

export function detectReferenceIntent(userText: string): {
  hasReference: boolean;
  entityFollowUp: boolean;
} {
  const t = userText.trim();
  let hasReference = false;
  let entityFollowUp = false;
  if (PRONOUN_REF.test(t) || TEMPORAL_REF.test(t) || ORDINAL_REF.test(t)) {
    hasReference = true;
  }
  if (/\btheir\b/i.test(t) && t.length < 280) {
    hasReference = true;
    entityFollowUp = true;
  }
  if (
    hasReference &&
    /\b(program|plan|pricing|feature|product|service|setup|how do we|how to)\b/i.test(t)
  ) {
    entityFollowUp = true;
  }
  return { hasReference, entityFollowUp };
}

export function resolveReference(
  userText: string,
  memory: WorkingMemoryLite,
): string | null {
  const t = userText.trim().toLowerCase();
  const ordinalMatch = t.match(
    /\b(?:the\s+)?(first|second|third|fourth|fifth|\d+)(?:st|nd|rd|th)?\s+(?:one|item|result|story|article|option|choice|alternative)\b/i,
  );
  if (ordinalMatch) {
    const word = ordinalMatch[1].toLowerCase();
    const map: Record<string, number> = {
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5,
    };
    const n = map[word] ?? Number(word);
    const list = memory.recentLists?.[memory.recentLists.length - 1];
    const item = list?.items.find((i) => i.ordinal === n);
    if (item) return item.label;
  }
  for (const ref of memory.references ?? []) {
    if (t.includes(ref.phrase.toLowerCase())) return ref.resolvesTo;
  }
  if (/\b(their|they|them|its|his|her)\b/i.test(t)) {
    if (memory.activeEntity) return memory.activeEntity;
    const ents = memory.entities ?? [];
    if (ents.length) return ents[ents.length - 1];
  }
  if (/\b(that|this|it|those)\b/i.test(t)) {
    const refs = memory.recentReferences ?? [];
    if (refs.length) return refs[refs.length - 1];
    if (memory.activeEntity) return memory.activeEntity;
  }
  return null;
}

export function extractEntityFromDomain(text: string): string | null {
  const m = text.match(/\b([a-z0-9][a-z0-9-]*)\.(com|io|dev|org|net|app)\b/i);
  if (!m) return null;
  const base = m[1];
  return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
}
