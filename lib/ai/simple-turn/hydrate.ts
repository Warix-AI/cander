/**
 * HYDRATE — deterministic context before PLAN sees the turn.
 */

import {
  collectEntitiesFromMessage,
} from "../orchestrator/entity-action-binding.ts";
import {
  resolveTemporalGrounding,
} from "../orchestrator/temporal-grounding.ts";
import { extractRequestedUrl } from "../orchestrator/web-retrieval.ts";
import type { HydrateResult, SimpleState } from "./types.ts";

const PRONOUN_RE = /\b(it|that|this|they|them|there)\b/i;
const FOLLOWUP_RE =
  /\b(first day|bring|what should i|and (then )?what|how about|also)\b/i;

export function hydrateTurn(state: SimpleState): HydrateResult {
  const temporal = resolveTemporalGrounding({
    content: state.text,
    conv: null,
  });

  const entities = collectEntitiesFromMessage(state.text);
  const primaryUrl = extractRequestedUrl(state.text);
  const urls = entities.map((e) => ({ url: e.url, domain: e.domain }));
  if (primaryUrl && !urls.some((u) => u.domain === primaryUrl.domain)) {
    urls.unshift({ url: primaryUrl.url, domain: primaryUrl.domain });
  }

  const resolved: string[] = [];
  const unresolved: string[] = [];

  for (const phrase of temporal.resolvedPhrases) {
    resolved.push(`"${phrase.phrase}" → ${phrase.resolved}`);
  }

  const entityHints = [
    ...urls.map((u) => u.domain),
    ...state.notes.entities,
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);

  const topicHint = state.notes.topic;

  // Pronoun binding — only when a single strong antecedent exists
  if (PRONOUN_RE.test(state.text)) {
    if (urls.length === 1) {
      resolved.push(`it/that/this → ${urls[0]!.domain}`);
    } else if (urls.length === 0 && entityHints.length === 1) {
      resolved.push(`it/that/this → ${entityHints[0]}`);
    } else if (urls.length === 0 && topicHint && FOLLOWUP_RE.test(state.text)) {
      resolved.push(`follow-up under topic → ${topicHint}`);
    } else if (urls.length === 0 && !topicHint && entityHints.length === 0) {
      unresolved.push("pronoun without clear antecedent");
    } else if (urls.length > 1 || entityHints.length > 1) {
      unresolved.push("ambiguous pronoun referent");
    }
  }

  if (FOLLOWUP_RE.test(state.text) && topicHint) {
    resolved.push(`conversation topic → ${topicHint}`);
  }

  const temporalLine = [
    `Current date: ${state.now.date} (${state.now.tz})`,
    `Current year: ${temporal.year}`,
    temporal.promptLine,
  ]
    .filter(Boolean)
    .join("\n");

  const planPrompt = [
    "## User message",
    state.text.trim(),
    "",
    "## Temporal grounding",
    temporalLine,
    "",
    "## Resolved references",
    resolved.length ? resolved.map((r) => `- ${r}`).join("\n") : "- (none)",
    "",
    "## Unresolved references",
    unresolved.length
      ? unresolved.map((r) => `- ${r}`).join("\n")
      : "- (none)",
    "",
    "## Conversation notes",
    `topic: ${topicHint ?? "(none)"}`,
    `entities: ${entityHints.join(", ") || "(none)"}`,
    `facts: ${state.notes.facts.join("; ") || "(none)"}`,
    "",
    "## Detected URLs/domains",
    urls.length
      ? urls.map((u) => `- ${u.domain} → ${u.url}`).join("\n")
      : "- (none)",
    state.attachments.length
      ? `\n## Attachments\n${state.attachments.map((a) => `- ${a.name} (${a.kind})`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    userText: state.text,
    resolved,
    unresolved,
    urls,
    temporalLine,
    year: temporal.year,
    topicHint,
    entityHints,
    planPrompt,
  };
}
