/**
 * Entity/action binding — preserve URL + summarize workflows as compound tasks.
 * Runs after request scan, before TaskGraph compile.
 */

import { extractRequestedUrl } from "./web-retrieval.ts";
import type { RequestLedger, RequestSpan } from "./request-scanner.ts";

export type ResolvedEntity = {
  id: string;
  url: string;
  domain: string;
  label: string;
};

export type UrlWorkflowSpec = {
  entity: ResolvedEntity;
  fetchId: string;
  summarizeId: string;
  askSpanId: string;
};

const DOMAIN_RE =
  /\b([a-z0-9][a-z0-9-]*\.(?:com|io|dev|org|net|app|ai|co|hq|us|gov|edu|uk))(?:\/[^\s,;]*)?\b/gi;

const FILLER_ASK_RES: RegExp[] = [
  /^can you\s+/i,
  /^please\s+/i,
  /^tell me about (it|that|this|them|the site|the page|this site|this page)\.?$/i,
  /^write me (a )?(quick )?summary\b/i,
  /^give me (a )?(quick )?summary\b/i,
  /^look at (it|that|this)\.?$/i,
  /^(a )?quick summary about what (?:it|they)('s| is| are) offering/i,
  /^about what (?:it|they)('s| is| are) offering/i,
  /^what (?:it|they)('s| is| are) offering/i,
];

const SUMMARIZE_INTENT_RE =
  /\b(summarize|summary|tell me about|describe|review|look at|what (?:it|they) (?:offer|do)|what(?:'s| is) (?:on|at) (?:the )?(?:site|page))\b/i;

const SITE_ACTION_RE =
  /\b(review|look at|visit|check out|read|browse|summarize|summary|tell me about|describe)\b/i;

export function slugDomain(domain: string): string {
  return domain.replace(/\./g, "_").replace(/[^a-z0-9_]/gi, "_");
}

export function collectEntitiesFromMessage(text: string): ResolvedEntity[] {
  const seen = new Set<string>();
  const entities: ResolvedEntity[] = [];

  const primary = extractRequestedUrl(text);
  if (primary) {
    seen.add(primary.domain);
    entities.push({
      id: `entity_${slugDomain(primary.domain)}`,
      url: primary.url,
      domain: primary.domain,
      label: primary.domain,
    });
  }

  for (const m of text.matchAll(DOMAIN_RE)) {
    const raw = m[1].replace(/[.,!?;:]+$/, "");
    const domain = raw.split("/")[0].replace(/^www\./i, "").toLowerCase();
    if (seen.has(domain)) continue;
    seen.add(domain);
    const url = raw.includes("/")
      ? `https://${raw.replace(/^https?:\/\//i, "")}`
      : `https://${domain}`;
    entities.push({
      id: `entity_${slugDomain(domain)}`,
      url,
      domain,
      label: domain,
    });
  }

  return entities;
}

export function isFillerAskText(text: string, entities: ResolvedEntity[]): boolean {
  const t = text.trim();
  if (!t) return true;
  if (FILLER_ASK_RES.some((re) => re.test(t))) return true;
  if (
    entities.length &&
    t.length < 100 &&
    /\b(it|that|this|them|the site|this page|what it offers|what it's offering)\b/i.test(t) &&
    !entities.some((e) => t.toLowerCase().includes(e.domain))
  ) {
    return true;
  }
  return false;
}

export function hasSummarizeSiteIntent(text: string): boolean {
  return SUMMARIZE_INTENT_RE.test(text);
}

export function wantsUrlWorkflow(text: string, entities: ResolvedEntity[]): boolean {
  if (!entities.length) return false;
  return hasSummarizeSiteIntent(text) || SITE_ACTION_RE.test(text);
}

function boundAskForEntity(entity: ResolvedEntity): RequestSpan {
  const spanId = `bound_${slugDomain(entity.domain)}`;
  return {
    id: spanId,
    text: `Summarize ${entity.domain}`,
    kind: "ASK",
    rule: "entity_action_bound",
  };
}

/** Bind pronouns and filler phrases to resolved URL entities; emit fetch→summarize workflows. */
export function bindEntitiesToActions(ledger: RequestLedger): {
  ledger: RequestLedger;
  urlWorkflows: UrlWorkflowSpec[];
} {
  const entities = collectEntitiesFromMessage(ledger.rawInput);
  const urlWorkflows: UrlWorkflowSpec[] = [];

  if (wantsUrlWorkflow(ledger.rawInput, entities)) {
    for (const entity of entities) {
      const slug = slugDomain(entity.domain);
      urlWorkflows.push({
        entity,
        fetchId: `fetch_${slug}`,
        summarizeId: `summarize_${slug}`,
        askSpanId: `bound_${slug}`,
      });
    }
  }

  const nonFillerAsks = ledger.asks.filter((a) => !isFillerAskText(a.text, entities));
  let asks: RequestSpan[];

  if (urlWorkflows.length) {
    const boundAsks = urlWorkflows.map((wf) => boundAskForEntity(wf.entity));
    const independentAsks = nonFillerAsks.filter((a) => {
      if (isFillerAskText(a.text, entities)) return false;
      if (urlWorkflows.length === 1 && entities.length === 1) {
        const domain = entities[0]!.domain;
        if (!a.text.toLowerCase().includes(domain) && a.text.length < 120) {
          return false;
        }
      }
      return true;
    });
    asks = boundAsks.length ? boundAsks : independentAsks;
    if (!asks.length) asks = boundAsks;
  } else if (entities.length && ledger.asks.length === 0) {
    asks = entities.map((entity) => boundAskForEntity(entity));
  } else {
    asks = nonFillerAsks.length ? nonFillerAsks : ledger.asks;
  }

  const askExtractorTriggers = ledger.askExtractorTriggers.filter((t) => {
    if (urlWorkflows.length && t === "unbound_pronoun_in_ask") return false;
    if (urlWorkflows.length === 1 && t === "multi_clause_single_ask") return false;
    return true;
  });

  const nonAskSpans = ledger.spans.filter(
    (s) => s.kind !== "ASK" || !isFillerAskText(s.text, entities),
  );
  const spans = [...nonAskSpans.filter((s) => s.kind !== "ASK"), ...asks];

  return {
    ledger: {
      ...ledger,
      spans,
      asks,
      askExtractorTriggers,
      urls: [...new Set([...ledger.urls, ...entities.map((e) => e.url)])],
    },
    urlWorkflows,
  };
}

export function graphHasFetchForDomain(
  graph: { nodes: Array<{ kind: string; query?: string; capability?: string }> },
  domain: string,
): boolean {
  const d = domain.toLowerCase();
  return graph.nodes.some((n) => {
    if (n.kind !== "FETCH_URL" && n.kind !== "RETRIEVE") return false;
    const q = (n.query ?? "").toLowerCase();
    if (!q) return false;
    if (n.kind === "FETCH_URL") return q.includes(d);
    if (n.capability === "web.read" || n.capability === "web.open") {
      return q.includes(d);
    }
    return false;
  });
}

export function graphUsesFillerQuery(
  graph: { nodes: Array<{ query?: string; label?: string }> },
): boolean {
  const filler = [
    "tell me about it",
    "what it offers",
    "what it's offering",
    "write me a summary",
    "look at it",
  ];
  for (const n of graph.nodes) {
    const q = `${n.query ?? ""} ${n.label ?? ""}`.toLowerCase();
    if (filler.some((f) => q.includes(f))) return true;
  }
  return false;
}
