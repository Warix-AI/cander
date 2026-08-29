import type { ConversationState, RetrievalSource } from "./types.ts";

/** Lightweight async memory update — not on critical path of streaming answer. */
export function buildConversationStateUpdate(opts: {
  prior: ConversationState | null | undefined;
  userText: string;
  assistantText: string;
  sources: RetrievalSource[];
  searchSessionId?: string | null;
  routeReason?: string;
}): ConversationState {
  const prior = opts.prior ?? {};
  const entities = new Set<string>(prior.entities ?? []);
  const topics = new Set<string>(prior.topics ?? []);
  const facts = [...(prior.facts ?? [])];
  const recentReferences = [...(prior.recentReferences ?? [])];
  const relevantSearchSessionIds = [
    ...(prior.relevantSearchSessionIds ?? []),
  ];

  // Pull capitalized tokens / quoted phrases as soft entities
  const caps = opts.userText.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g) ?? [];
  for (const c of caps.slice(0, 8)) entities.add(c);
  for (const s of opts.sources.slice(0, 5)) {
    if (s.title) recentReferences.push(s.title.slice(0, 80));
  }
  if (opts.searchSessionId) {
    relevantSearchSessionIds.push(opts.searchSessionId);
  }

  const topicGuess = opts.userText
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .slice(0, 80);
  if (topicGuess) topics.add(topicGuess);

  if (opts.assistantText.trim()) {
    facts.push(opts.assistantText.trim().slice(0, 240));
  }

  return {
    topics: [...topics].slice(-12),
    entities: [...entities].slice(-24),
    decisions: prior.decisions ?? [],
    facts: facts.slice(-20),
    unresolvedThreads: prior.unresolvedThreads ?? [],
    recentReferences: recentReferences.slice(-16),
    relevantSearchSessionIds: [...new Set(relevantSearchSessionIds)].slice(-10),
  };
}

export function resolveReferenceHints(opts: {
  userText: string;
  state: ConversationState | null | undefined;
}): string | null {
  const t = opts.userText.trim().toLowerCase();
  if (!/\b(the (second|first|third) one|that one|those|it|them|this)\b/i.test(t)) {
    return null;
  }
  const refs = opts.state?.recentReferences ?? [];
  if (!refs.length) return null;
  return `User may be referring to recent references: ${refs.slice(0, 5).join("; ")}`;
}
