/**
 * Per-turn relation to prior context — remember broadly, activate selectively.
 * Deterministic-first; no FM required.
 */

import type { ConversationTurnState, EntityRef } from "./conversation-types.ts";
import { activeEntities } from "./apply-delta.ts";
import { nextConvId, type ConversationDelta } from "./conversation-types.ts";

export type TurnRelation =
  | "continuation"
  | "related"
  | "reference"
  | "topic_switch";

export type TurnRelationResult = {
  relation: TurnRelation;
  carrySubject: boolean;
  maxTranscriptTurns: number;
  reactivateEntityLabel?: string;
  newEntity?: { label: string; type: string };
};

const ELLIPSIS_FOLLOWUP =
  /^\s*(when|where|what time|how much|how many|who|why|which one|what about that)\??\s*$/i;
const PRONOUN =
  /\b(it|them|that|this|those|their|his|her)\b/i;
const BACK_TO =
  /\b(?:go\s+)?back\s+to(?:\s+the)?\s+(.+?)[?.!]?\s*$/i;
const RETURN_TO = /\breturn\s+to(?:\s+the)?\s+(.+?)[?.!]?\s*$/i;
const ACTUALLY_NEW = /^\s*(actually|no[,.]?\s+|instead[,.]?\s+)/i;
const URL_RE = /https?:\/\/[^\s)>"']+/i;

const DOMAIN_KEYWORDS: Record<string, RegExp> = {
  food: /\b(calorie|nutrition|burger|meal|recipe|protein|carb|fat|eat|food|restaurant|menu)\b/i,
  sports: /\b(game|score|team|football|basketball|soccer|byu|nfl|nba|match|schedule|opponent|kickoff)\b/i,
  web: /\b(site|website|page|url|domain|browse|link)\b/i,
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function overlapRatio(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const hits = a.filter((t) => setB.has(t)).length;
  return hits / Math.max(a.length, b.length);
}

function activeLabels(state: ConversationTurnState | null | undefined): string[] {
  if (!state) return [];
  const labels: string[] = [];
  for (const e of activeEntities(state)) labels.push(e.label);
  for (const t of state.topics) {
    if (t.contextClass === "ACTIVE") labels.push(t.label);
  }
  return labels;
}

function availableEntities(
  state: ConversationTurnState | null | undefined,
): EntityRef[] {
  if (!state) return [];
  return state.entities.filter((e) => e.contextClass === "AVAILABLE");
}

function extractUrl(text: string): string | null {
  const m = text.match(URL_RE);
  return m ? m[0] : null;
}

function domainOf(text: string, entities?: EntityRef[]): string | null {
  if (entities?.length) {
    const activeTypes = new Set(
      entities.filter((e) => e.contextClass === "ACTIVE").map((e) => e.type),
    );
    if (activeTypes.has("food")) return "food";
    if (activeTypes.has("sports")) return "sports";
    if (activeTypes.has("website")) return "web";
  }
  for (const [name, re] of Object.entries(DOMAIN_KEYWORDS)) {
    if (re.test(text)) return name;
  }
  return null;
}

function matchAvailableEntity(
  phrase: string,
  state: ConversationTurnState | null | undefined,
): EntityRef | undefined {
  const lower = phrase.toLowerCase();
  for (const e of availableEntities(state)) {
    const el = e.label.toLowerCase();
    if (lower.includes(el) || el.includes(lower)) return e;
    const tokens = tokenize(e.label);
    if (tokens.some((t) => lower.includes(t))) return e;
  }
  for (const t of state?.topics ?? []) {
    if (t.contextClass !== "AVAILABLE") continue;
    const tl = t.label.toLowerCase();
    if (lower.includes(tl) || tl.includes(lower)) {
      return { id: t.id, type: "topic", label: t.label, contextClass: "AVAILABLE" };
    }
  }
  return undefined;
}

/** Classify how the current message relates to prior conversation context. */
export function classifyTurnRelation(opts: {
  userMessage: string;
  previous?: ConversationTurnState | null;
}): TurnRelationResult {
  const content = (opts.userMessage || "").trim();
  const prev = opts.previous ?? null;
  const actives = activeLabels(prev);
  const msgTokens = tokenize(content);
  const activeTokens = tokenize(actives.join(" "));
  const overlap = overlapRatio(msgTokens, activeTokens);

  // Early domain pivot: food context + sports question (before pronoun heuristics)
  if (actives.length) {
    const priorDomain = domainOf(actives.join(" "), prev?.entities);
    const sportsPivot =
      /\b(football|game|byu|utes|team|schedule|face off|opponent|nba|nfl)\b/i.test(
        content,
      );
    if (
      (priorDomain === "food" && sportsPivot) ||
      (priorDomain === "food" && domainOf(content) === "sports")
    ) {
      return {
        relation: "topic_switch",
        carrySubject: false,
        maxTranscriptTurns: 0,
        newEntity: { label: content.slice(0, 80), type: "sports" },
      };
    }
  }

  const backMatch =
    content.match(BACK_TO) ?? content.match(RETURN_TO);
  if (backMatch?.[1]) {
    const phrase = backMatch[1].trim();
    const matched = matchAvailableEntity(phrase, prev);
    return {
      relation: "reference",
      carrySubject: true,
      maxTranscriptTurns: 6,
      reactivateEntityLabel: matched?.label ?? phrase,
    };
  }

  if (
    /\b(what did you say|you said earlier|we discussed|earlier about)\b/i.test(
      content,
    )
  ) {
    return {
      relation: "reference",
      carrySubject: true,
      maxTranscriptTurns: 8,
    };
  }

  const url = extractUrl(content);
  if (url && actives.length) {
    const priorWeb = actives.some((l) => URL_RE.test(l) || DOMAIN_KEYWORDS.web!.test(l));
    const urlHost = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return url;
      }
    })();
    const sameSite = actives.some((l) => l.includes(urlHost));
    if (!sameSite) {
      return {
        relation: "topic_switch",
        carrySubject: false,
        maxTranscriptTurns: 0,
        newEntity: { label: urlHost, type: "website" },
      };
    }
  }

  if (ELLIPSIS_FOLLOWUP.test(content) && actives.length === 1) {
    return {
      relation: "continuation",
      carrySubject: true,
      maxTranscriptTurns: 4,
    };
  }

  if (
    PRONOUN.test(content) &&
    actives.length === 1 &&
    content.split(/\s+/).length <= 12
  ) {
    return {
      relation: "continuation",
      carrySubject: true,
      maxTranscriptTurns: 4,
    };
  }

  if (ACTUALLY_NEW.test(content) && content.length < 120) {
    const rest = content.replace(ACTUALLY_NEW, "").trim();
    if (rest.length >= 3 && overlap < 0.25) {
      return {
        relation: "topic_switch",
        carrySubject: false,
        maxTranscriptTurns: 0,
        newEntity: { label: rest.slice(0, 80), type: "topic" },
      };
    }
  }

  if (actives.length && overlap < 0.15) {
    const priorDomain = domainOf(actives.join(" "), prev?.entities);
    const msgDomain = domainOf(content);
    if (
      priorDomain === "food" &&
      /\b(football|game|byu|utes|team|schedule|face off|opponent)\b/i.test(
        content,
      )
    ) {
      return {
        relation: "topic_switch",
        carrySubject: false,
        maxTranscriptTurns: 0,
        newEntity: { label: content.slice(0, 80), type: "sports" },
      };
    }
    if (priorDomain && msgDomain && priorDomain !== msgDomain) {
      return {
        relation: "topic_switch",
        carrySubject: false,
        maxTranscriptTurns: 0,
        newEntity: { label: content.slice(0, 80), type: msgDomain },
      };
    }
    if (
      priorDomain &&
      !msgDomain &&
      overlap < 0.08 &&
      /\b(when|who|what|where|game|football|team|score|schedule)\b/i.test(content)
    ) {
      return {
        relation: "topic_switch",
        carrySubject: false,
        maxTranscriptTurns: 0,
        newEntity: { label: content.slice(0, 80), type: "sports" },
      };
    }
    if (!msgDomain && overlap < 0.08 && content.length > 12) {
      return {
        relation: "topic_switch",
        carrySubject: false,
        maxTranscriptTurns: 1,
      };
    }
  }

  if (actives.length && overlap >= 0.35 && content.length > 15) {
    return {
      relation: "related",
      carrySubject: true,
      maxTranscriptTurns: 6,
    };
  }

  if (actives.length && overlap >= 0.15) {
    return {
      relation: "continuation",
      carrySubject: true,
      maxTranscriptTurns: 4,
    };
  }

  if (!actives.length) {
    return {
      relation: content.length > 30 ? "related" : "continuation",
      carrySubject: false,
      maxTranscriptTurns: 2,
    };
  }

  return {
    relation: "topic_switch",
    carrySubject: false,
    maxTranscriptTurns: 0,
  };
}

/** Map relation to transcript cap used by buildSelectiveDialoguePrompt. */
export function transcriptTurnCap(relation: TurnRelation): number {
  switch (relation) {
    case "topic_switch":
      return 0;
    case "continuation":
      return 4;
    case "reference":
      return 6;
    case "related":
      return 6;
    default:
      return 4;
  }
}

/** Merge turn-relation classification into ConversationDelta hints. */
export function deltaHintsFromTurnRelation(
  result: TurnRelationResult,
  prev: ConversationTurnState | null | undefined,
): Partial<ConversationDelta> {
  const partial: Partial<ConversationDelta> = {};
  const actives = prev ? activeEntities(prev) : [];

  if (result.relation === "topic_switch") {
    if (actives.length) {
      if (result.newEntity) {
        partial.entityChanges = [
          ...actives.map((e) => ({
            op: "replace" as const,
            from: e,
            to: {
              id: nextConvId("ent"),
              type: result.newEntity!.type,
              label: result.newEntity!.label,
              contextClass: "ACTIVE" as const,
            },
          })),
        ];
      } else {
        partial.entityChanges = actives.map((e) => ({
          op: "remove" as const,
          from: e,
        }));
      }
    } else if (result.newEntity) {
      partial.entityChanges = [
        {
          op: "add",
          entity: {
            id: nextConvId("ent"),
            type: result.newEntity.type,
            label: result.newEntity.label,
            contextClass: "ACTIVE",
          },
        },
      ];
    }
    if (prev?.topics.some((t) => t.contextClass === "ACTIVE")) {
      partial.topicSwitch = {
        expireTopicIds: prev.topics
          .filter((t) => t.contextClass === "ACTIVE")
          .map((t) => t.id),
      };
    }
  }

  if (result.relation === "reference" && result.reactivateEntityLabel) {
    const matched = matchAvailableEntity(result.reactivateEntityLabel, prev);
    if (matched) {
      partial.entityChanges = [
        { op: "set", entity: { ...matched, contextClass: "ACTIVE" } },
      ];
    }
  }

  return partial;
}
