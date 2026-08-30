import type {
  ConversationWorkingMemory,
  EvidenceBriefing,
  EvidenceItem,
} from "./types.ts";

const ENTITY_STOP = new Set([
  "The",
  "This",
  "That",
  "What",
  "When",
  "Where",
  "How",
  "Why",
  "Can",
  "Could",
  "Would",
  "Should",
  "Please",
  "Thanks",
  "Hello",
  "Hey",
  "Yes",
  "No",
  "They",
  "Their",
  "There",
  "Here",
  "Also",
  "However",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

function capitalizeWord(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function extractEntitiesFromText(text: string): string[] {
  const found = new Set<string>();
  for (const c of text.match(/\b[A-Z][a-zA-Z0-9]+(?:\.[a-z]+)?\b/g) ?? []) {
    if (!ENTITY_STOP.has(c) && c.length > 1) found.add(c);
  }
  for (const domain of text.match(
    /\b([a-z0-9][a-z0-9-]*)\.(com|io|dev|org|net|app|ai|co)\b/gi,
  ) ?? []) {
    const base = domain.split(".")[0];
    if (base.length > 2) found.add(capitalizeWord(base));
  }
  return [...found];
}

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
  const decisions = [...(prior.decisions ?? [])];

  for (const e of extractEntitiesFromText(opts.userText)) entities.add(e);
  for (const e of extractEntitiesFromText(opts.assistantText)) entities.add(e);

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
      references.push({
        phrase: `the ${ordinalWord(item.ordinal)} option`,
        resolvesTo: item.label,
      });
      recentReferences.push(item.label);
    }
  }

  // Track primary entity from web evidence titles / URLs
  for (const ev of opts.evidence) {
    if (ev.title) {
      for (const e of extractEntitiesFromText(ev.title)) entities.add(e);
    }
    if (ev.url) {
      for (const e of extractEntitiesFromText(ev.url)) entities.add(e);
    }
  }

  for (const sid of opts.searchSessionIds) {
    if (sid) relevantSearchSessionIds.push(sid);
  }

  const entityList = [...entities].slice(-24);
  const activeEntity =
    entityList[entityList.length - 1] ?? prior.activeEntity ?? undefined;
  const activeTopic = topic || prior.activeTopic || entityList[entityList.length - 1];

  if (activeEntity) {
    recentReferences.push(activeEntity);
  }

  return {
    ...prior,
    activeEntity,
    activeTopic: activeTopic?.slice(0, 120),
    topics: [...topics].slice(-12),
    entities: entityList,
    decisions: decisions.slice(-12),
    facts: facts.slice(-20),
    recentReferences: [...new Set(recentReferences)].slice(-16),
    relevantSearchSessionIds: [...new Set(relevantSearchSessionIds)].slice(-10),
    recentLists: recentLists.slice(-4),
    references: references.slice(-24),
    unresolvedThreads: opts.briefing?.unresolved?.length
      ? opts.briefing.unresolved.slice(0, 5)
      : prior.unresolvedThreads ?? [],
  };
}

/** Payload for cross-chat memory index upsert. */
export function buildMemoryIndexPayload(opts: {
  chatId: string;
  ownerId: string;
  workspaceId: string | null;
  title: string;
  memory: ConversationWorkingMemory;
  messageCount: number;
  lastMessageAt: string | null;
  projectRefIds: string[];
}): Record<string, unknown> {
  const summaryParts = [
    ...(opts.memory.facts ?? []).slice(-3),
    ...(opts.memory.decisions ?? []).slice(-2),
  ].filter(Boolean);
  return {
    chat_id: opts.chatId,
    owner_id: opts.ownerId,
    workspace_id: opts.workspaceId,
    title: opts.title.slice(0, 200),
    summary: summaryParts.join(" · ").slice(0, 600),
    entities: (opts.memory.entities ?? []).slice(-16),
    topics: (opts.memory.topics ?? []).slice(-8),
    project_ref_ids: opts.projectRefIds.slice(0, 12),
    message_count: opts.messageCount,
    last_message_at: opts.lastMessageAt,
    updated_at: new Date().toISOString(),
  };
}

function ordinalWord(n: number): string {
  return ["", "first", "second", "third", "fourth", "fifth"][n] ?? `${n}th`;
}

/** Resolve “the second one” / “that” / “their” from working memory. */
export function resolveReference(
  userText: string,
  memory: ConversationWorkingMemory,
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

  // Explicit phrase → entity mappings
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
    const entities = memory.entities ?? [];
    if (entities.length) return entities[entities.length - 1];
  }

  if (
    /\b(what you said|you mentioned|earlier|before|previously|still true|is that still)\b/i.test(
      t,
    )
  ) {
    if (memory.activeTopic) return memory.activeTopic;
    if (memory.activeEntity) return memory.activeEntity;
    const topics = memory.topics ?? [];
    if (topics.length) return topics[topics.length - 1];
  }

  return null;
}
