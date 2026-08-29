import type {
  ConversationWorkingMemory,
  EvidenceBriefing,
  EvidenceItem,
} from "./types.ts";

/** Compact memory delta after a successful answer — no raw pages. */
export function buildMemoryDelta(opts: {
  prior: ConversationWorkingMemory;
  userText: string;
  assistantText: string;
  evidence: EvidenceItem[];
  briefing: EvidenceBriefing | null;
  searchSessionIds: string[];
}): ConversationWorkingMemory {
  const prior = opts.prior ?? {};
  const entities = new Set<string>(prior.entities ?? []);
  const topics = new Set<string>(prior.topics ?? []);
  const facts = [...(prior.facts ?? [])];
  const recentReferences = [...(prior.recentReferences ?? [])];
  const relevantSearchSessionIds = [
    ...(prior.relevantSearchSessionIds ?? []),
  ];
  const recentLists = [...(prior.recentLists ?? [])];
  const references = [...(prior.references ?? [])];

  const caps =
    opts.userText.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g) ?? [];
  for (const c of caps.slice(0, 8)) entities.add(c);

  const topic = opts.userText.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().slice(0, 80);
  if (topic) topics.add(topic);

  for (const f of (opts.briefing?.facts ?? []).slice(0, 5)) {
    if (f.claim) facts.push(f.claim.slice(0, 240));
  }

  // Ordered list extraction from assistant answer (1. / 2. / - bullets)
  const listItems: Array<{ ordinal: number; label: string; sourceIds?: string[] }> =
    [];
  const lines = opts.assistantText.split(/\n+/);
  let ordinal = 0;
  for (const line of lines) {
    const m =
      line.match(/^\s*(?:\d+)[.)]\s+(.+)/) ||
      line.match(/^\s*[-*•]\s+(.+)/);
    if (m?.[1]) {
      ordinal += 1;
      listItems.push({
        ordinal,
        label: m[1].trim().slice(0, 160),
        sourceIds: (opts.briefing?.facts ?? [])
          .flatMap((f) => f.sourceIds)
          .slice(0, 3),
      });
    }
  }
  if (listItems.length >= 2) {
    const id = `list_${Date.now().toString(36)}`;
    recentLists.push({ id, items: listItems.slice(0, 8) });
    for (const item of listItems.slice(0, 5)) {
      references.push({
        phrase: `the ${ordinalWord(item.ordinal)} one`,
        resolvesTo: item.label,
      });
      recentReferences.push(item.label);
    }
  }

  for (const sid of opts.searchSessionIds) {
    if (sid) relevantSearchSessionIds.push(sid);
  }

  return {
    ...prior,
    topics: [...topics].slice(-12),
    entities: [...entities].slice(-24),
    facts: facts.slice(-20),
    recentReferences: recentReferences.slice(-16),
    relevantSearchSessionIds: [...new Set(relevantSearchSessionIds)].slice(-10),
    recentLists: recentLists.slice(-4),
    references: references.slice(-20),
    unresolvedThreads: opts.briefing?.unresolved?.length
      ? opts.briefing.unresolved.slice(0, 5)
      : prior.unresolvedThreads ?? [],
  };
}

function ordinalWord(n: number): string {
  return ["", "first", "second", "third", "fourth", "fifth"][n] ?? `${n}th`;
}

/** Resolve “the second one” / “that” from working memory. */
export function resolveReference(
  userText: string,
  memory: ConversationWorkingMemory,
): string | null {
  const t = userText.trim().toLowerCase();
  const ordinalMatch = t.match(
    /\b(?:the\s+)?(first|second|third|fourth|fifth|\d+)(?:st|nd|rd|th)?\s+(?:one|item|result|story|article)\b/i,
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
  if (/\b(that|this|it|them|those)\b/i.test(t)) {
    const refs = memory.recentReferences ?? [];
    if (refs.length) return refs[refs.length - 1];
    const entities = memory.entities ?? [];
    if (entities.length) return entities[entities.length - 1];
  }
  return null;
}
