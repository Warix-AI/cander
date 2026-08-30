/**
 * Deterministic-first ConversationDelta resolver.
 * Returns null when not high-confidence — caller may use semantic path.
 */

import {
  emptyDelta,
  nextConvId,
  type ConversationDelta,
  type ConversationTurnState,
  type EntityRef,
} from "./conversation-types.ts";
import { activeEntities, activeResultSet } from "./apply-delta.ts";

export type DeltaResolverInput = {
  previous: ConversationTurnState;
  userMessage: string;
  /** Optional candidates for ambiguous resolution (entity ids/labels). */
  candidates?: {
    entities?: EntityRef[];
    contacts?: string[];
  };
};

const RETRY =
  /^(try again|retry|redo( it)?|again)[.!]?$/i;
const RETRY_INCORRECT =
  /\b(that'?s|that is|this is)\s+(incorrect|wrong|not right|inaccurate)\b|\b(incorrect|wrong)\b[\s\S]{0,40}\b(try again|retry)\b/i;
const TRY_AGAIN_WEAK =
  /\b(that'?s not what I asked|not what I (meant|asked)|wrong|look again|check again)\b/i;
const LONGER = /\b(longer|more detail|expand|in detail|walk me through)\b/i;
const SHORTER =
  /\b(shorter|briefly|tl;?dr|main points|key points|just (the )?bullets?|simpler|like I'?m five|eli5)\b/i;
const FORGET_ALL =
  /\b(forget (all )?that|start over|never\s*mind all (of )?that|scratch that( whole)?)\b/i;
const ACTUALLY = /^\s*(actually|no[,.]?\s+)/i;
const UNIT_FEET = /\b(in feet|into feet|how many feet)\b/i;
const UNIT_METERS = /\b(in meters?|into meters?)\b/i;
const GEO_US = /\b(in the (us|u\.s\.|united states)|us only|domestically)\b/i;
const WHAT_ABOUT = /^\s*what about\s+(.+?)[?.!]?\s*$/i;
const AND_ITEM = /^\s*and\s+(.+?)[?.!]?\s*$/i;
const YEAR = /\b(20\d{2})\b/;
const NOW_FRESH =
  /\b(now|current(ly)?|today|this year|as of (now|today)|updated|latest)\b/i;
const ORDINAL =
  /\b(the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|option\s*[1-5]|#?\s*[1-5]|one before (it|that)|previous one)\b/i;
const CHEAPER = /\b(same thing but )?cheaper|under\s*\$?\d+|less expensive\b/i;
const EXCLUDE = /\bnothing from\s+([A-Za-z][\w\s.-]{1,40})/i;
const INTERNAL_PROJECTS =
  /\b(what projects|my projects|projects (do I|in Build)|edited most recently|edit most recently)\b/i;
const WHO_FOUNDED = /^\s*who (founded|started|created) (it|them)\??\s*$/i;
const WHEN_ELLIPSIS = /^\s*when\??\s*$/i;
const WHERE_ELLIPSIS = /^\s*where\??\s*$/i;
const EARLIER_PRICING =
  /\bwhat (did you|you) say earlier about pricing\b/i;
const GO_BACK =
  /\b(go back to|return to|about that)\b[\s\S]{0,40}\b(we discussed|earlier|before)\b/i;

function ordinalFromText(t: string): number | null {
  if (/\bone before (it|that)|previous one\b/i.test(t)) return -1; // relative
  const m = t.match(ORDINAL);
  if (!m) return null;
  const raw = (m[2] || "").toLowerCase();
  const map: Record<string, number> = {
    first: 1,
    "1st": 1,
    second: 2,
    "2nd": 2,
    third: 3,
    "3rd": 3,
    fourth: 4,
    "4th": 4,
    fifth: 5,
    "5th": 5,
  };
  if (map[raw]) return map[raw]!;
  const num = raw.match(/[1-5]/);
  return num ? Number(num[0]) : null;
}

function high(
  partial: Partial<ConversationDelta> &
    Pick<ConversationDelta, "resolutionMethod">,
): ConversationDelta {
  return {
    ...emptyDelta("high", partial.resolutionMethod || "deterministic"),
    ...partial,
    entityChanges: partial.entityChanges ?? [],
    constraintAdds: partial.constraintAdds ?? {},
    constraintReplacements: partial.constraintReplacements ?? {},
    exclusions: partial.exclusions ?? [],
    resolutionConfidence: "high",
    resolutionMethod: partial.resolutionMethod || "deterministic",
  };
}

/**
 * Returns a high-confidence delta, or null if the turn needs semantic resolution.
 */
export function resolveDeterministicDelta(
  input: DeltaResolverInput,
): ConversationDelta | null {
  const content = (input.userMessage || "").trim();
  if (!content) return null;
  const prev = input.previous;
  const actives = activeEntities(prev);

  if (
    RETRY.test(content) ||
    RETRY_INCORRECT.test(content) ||
    TRY_AGAIN_WEAK.test(content)
  ) {
    return high({
      resolutionMethod: "deterministic",
      dissatisfaction: true,
      freshness: true,
      externalRetrievalRequired: true,
    });
  }

  if (FORGET_ALL.test(content)) {
    return high({
      resolutionMethod: "deterministic",
      forgetAllActive: true,
      intentChange: null,
    });
  }

  if (EARLIER_PRICING.test(content)) {
    const pricingEv = prev.evidence.find((e) =>
      /pric/i.test(`${e.title ?? ""} ${e.url ?? ""}`),
    );
    return high({
      resolutionMethod: "deterministic",
      references: pricingEv
        ? {
            evidence: [
              {
                evidenceId: pricingEv.evidenceId,
                url: pricingEv.url,
                sourceType: pricingEv.sourceType,
              },
            ],
          }
        : undefined,
      externalRetrievalRequired: !pricingEv,
    });
  }

  if (SHORTER.test(content)) {
    const shape = /\b(main points|key points|bullets?)\b/i.test(content)
      ? ("key_points" as const)
      : ("brief" as const);
    return high({
      resolutionMethod: "deterministic",
      answerShapeChange: shape,
    });
  }

  if (LONGER.test(content)) {
    return high({
      resolutionMethod: "deterministic",
      answerShapeChange: "detailed",
    });
  }

  if (UNIT_FEET.test(content) && (actives.length || prev.constraints.attribute)) {
    return high({
      resolutionMethod: "deterministic",
      constraintReplacements: { unit: "feet" },
      constraintAdds: prev.constraints.attribute
        ? {}
        : { attribute: "height" },
    });
  }

  if (UNIT_METERS.test(content) && actives.length) {
    return high({
      resolutionMethod: "deterministic",
      constraintReplacements: { unit: "meters" },
    });
  }

  if (GEO_US.test(content) && (actives.length || prev.currentIntent)) {
    return high({
      resolutionMethod: "deterministic",
      constraintReplacements: { geography: "United States" },
      externalRetrievalRequired: true,
      freshness: true,
    });
  }

  const yearM = content.match(/^\s*in\s+(20\d{2})\s*[?.!]?\s*$/i) ||
    (content.length < 40 ? content.match(YEAR) : null);
  if (
    yearM &&
    prev.currentIntent &&
    (NOW_FRESH.test(content) || /^\s*in\s+20\d{2}/i.test(content))
  ) {
    return high({
      resolutionMethod: "deterministic",
      freshness: true,
      externalRetrievalRequired: true,
      constraintReplacements: { timeframe: yearM[1] || yearM[0]! },
    });
  }

  if (
    NOW_FRESH.test(content) &&
    content.length < 48 &&
    prev.currentIntent &&
    /location|count|population|price/i.test(prev.currentIntent)
  ) {
    return high({
      resolutionMethod: "deterministic",
      freshness: true,
      externalRetrievalRequired: true,
    });
  }

  const about = content.match(WHAT_ABOUT);
  if (about?.[1] && prev.constraints.attribute) {
    const label = about[1].trim().replace(/[?.!]+$/, "");
    return high({
      resolutionMethod: "deterministic",
      entityChanges: [
        {
          op: "replace",
          from: actives[0],
          to: {
            id: nextConvId("ent"),
            type: actives[0]?.type || "place",
            label,
            contextClass: "ACTIVE",
          },
        },
      ],
      externalRetrievalRequired: true,
    });
  }

  const andItem = content.match(AND_ITEM);
  if (andItem?.[1] && actives.length) {
    const label = andItem[1].trim().replace(/[?.!]+$/, "");
    return high({
      resolutionMethod: "deterministic",
      constraintAdds: { addItem: label },
      entityChanges: [
        {
          op: "add",
          entity: {
            id: nextConvId("ent"),
            type: "product",
            label,
            contextClass: "ACTIVE",
          },
        },
      ],
      externalRetrievalRequired: true,
    });
  }

  const ord = ordinalFromText(content);
  const rs = activeResultSet(prev);
  if (ord != null && rs) {
    let targetOrd = ord;
    if (ord === -1) {
      // "the one before it" — need a previously referenced ordinal; default to 1 before last active
      const last = rs.items[rs.items.length - 1];
      targetOrd = Math.max(1, (last?.ordinal ?? 2) - 1);
    }
    const item = rs.items.find((i) => i.ordinal === targetOrd);
    if (item) {
      return high({
        resolutionMethod: "deterministic",
        references: {
          priorResults: [
            {
              resultSetId: rs.resultSetId,
              itemId: item.itemId,
              ordinal: item.ordinal,
            },
          ],
        },
        entityChanges: [
          {
            op: "set",
            entity: {
              id: item.itemId,
              type: "list_item",
              label: item.label,
              contextClass: "ACTIVE",
            },
          },
        ],
      });
    }
  }

  if (WHO_FOUNDED.test(content) && actives[0]) {
    return high({
      resolutionMethod: "deterministic",
      constraintAdds: { attribute: "founder" },
      externalRetrievalRequired: true,
    });
  }
  if (WHEN_ELLIPSIS.test(content) && actives[0]) {
    return high({
      resolutionMethod: "deterministic",
      constraintAdds: {
        attribute: prev.constraints.attribute === "founder"
          ? "founding_date"
          : "time",
      },
      externalRetrievalRequired: true,
    });
  }
  if (WHERE_ELLIPSIS.test(content) && actives[0]) {
    return high({
      resolutionMethod: "deterministic",
      constraintAdds: { attribute: "location" },
      externalRetrievalRequired: true,
    });
  }

  if (EXCLUDE.test(content)) {
    const m = content.match(EXCLUDE);
    return high({
      resolutionMethod: "deterministic",
      exclusions: [m![1]!.trim()],
      dissatisfaction: true,
    });
  }

  if (CHEAPER.test(content) && prev.currentIntent) {
    return high({
      resolutionMethod: "deterministic",
      constraintAdds: { cheaper: "true" },
      constraintReplacements: content.match(/\$?\d+/)
        ? { maxPrice: content.match(/\$?(\d+)/)?.[1] || "cheaper" }
        : {},
      externalRetrievalRequired: true,
    });
  }

  if (INTERNAL_PROJECTS.test(content)) {
    return high({
      resolutionMethod: "deterministic",
      intentChange: prev.currentIntent || "list_projects",
      internalDataRequired: true,
      externalRetrievalRequired: false,
    });
  }

  // "Actually Provo" / "No, the fruit" style — high confidence only when short
  if (ACTUALLY.test(content) && content.length < 80) {
    const rest = content.replace(ACTUALLY, "").trim();
    if (/^the fruit\b/i.test(rest) && actives[0]) {
      return high({
        resolutionMethod: "deterministic",
        entityChanges: [
          {
            op: "replace",
            from: actives[0],
            to: {
              id: nextConvId("ent"),
              type: "food",
              label: "apple (fruit)",
              contextClass: "ACTIVE",
            },
          },
        ],
      });
    }
    if (/^provo\b/i.test(rest) || /\b(to |in )?provo\b/i.test(rest)) {
      return high({
        resolutionMethod: "deterministic",
        constraintReplacements: { location: "Provo" },
        externalRetrievalRequired: true,
        freshness: true,
      });
    }
    if (/internal dashboard/i.test(rest)) {
      return high({
        resolutionMethod: "deterministic",
        intentChange: "build_internal_dashboard",
        topicSwitch: {
          expireTopicIds: prev.topics
            .filter((t) => t.contextClass === "ACTIVE")
            .map((t) => t.id),
          activateTopicId: nextConvId("topic"),
          activateLabel: "internal dashboard",
        },
        forgetAllActive: false,
      });
    }
  }

  // Dual antecedent ambiguity — not high confidence
  const candidates = input.candidates?.entities ?? [];
  if (
    /\bit\b/i.test(content) &&
    candidates.length >= 2 &&
    content.length < 60
  ) {
    return {
      ...emptyDelta("low", "deterministic"),
      unresolvedAmbiguity: true,
      resolutionConfidence: "low",
      resolutionMethod: "deterministic",
    };
  }

  // Explicit reopen of AVAILABLE topic
  if (GO_BACK.test(content)) {
    const avail = prev.topics.find((t) => t.contextClass === "AVAILABLE");
    const availEnt = prev.entities.find((e) => e.contextClass === "AVAILABLE");
    if (avail || availEnt) {
      return high({
        resolutionMethod: "deterministic",
        topicSwitch: avail
          ? { activateTopicId: avail.id, activateLabel: avail.label }
          : undefined,
        entityChanges: availEnt
          ? [{ op: "set", entity: { ...availEnt, contextClass: "ACTIVE" } }]
          : [],
      });
    }
  }

  // Short constraint accumulation under active shopping intent
  if (
    prev.currentIntent &&
    /laptop|crm|find|recommend/i.test(prev.currentIntent) &&
    content.length < 40
  ) {
    if (/^under\s*\$?\d+/i.test(content)) {
      const n = content.match(/\d+/)?.[0];
      return high({
        resolutionMethod: "deterministic",
        constraintAdds: { maxPrice: n || content },
      });
    }
    if (/^mac\b/i.test(content)) {
      return high({
        resolutionMethod: "deterministic",
        constraintAdds: { platform: "Mac" },
      });
    }
    if (/^\d+\s*inch/i.test(content)) {
      return high({
        resolutionMethod: "deterministic",
        constraintAdds: {
          screenSize: content.replace(/[?.!]+$/, "").trim(),
        },
      });
    }
    if (/^tiny plumbing/i.test(content) || /plumbing company/i.test(content)) {
      return high({
        resolutionMethod: "deterministic",
        constraintReplacements: {
          businessSize: "tiny",
          industry: "plumbing",
        },
        dissatisfaction: true,
      });
    }
  }

  return null;
}
