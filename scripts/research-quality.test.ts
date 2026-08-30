/**
 * Research quality, structured breakdown, sources row helpers, keyboard policy.
 * Run: node --experimental-strip-types --test scripts/research-quality.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  deeperResearchQueries,
  evaluateResearchQuality,
  extractFactualComponents,
  formatComponentBreakdown,
  isCorrectionRetry,
  resolveComponentFacts,
  sumVerifiedComponents,
} from "../lib/ai/orchestrator/research-quality.ts";
import { inferAnswerShape } from "../lib/ai/answer-shape/index.ts";
import { resolveDeterministicDelta } from "../lib/ai/turn-environment/deterministic-delta.ts";
import { emptyConversationTurnState } from "../lib/ai/turn-environment/conversation-types.ts";
import { compileTurnProfile } from "../lib/ai/turn-environment/index.ts";

function readRepo(rel: string) {
  return fs.readFileSync(
    fileURLToPath(new URL(rel, import.meta.url)),
    "utf8",
  );
}

describe("multi-source factual research", () => {
  it("rejects a single snippet as insufficient", () => {
    const gate = evaluateResearchQuality({
      question: "How many calories in a Panda Express orange chicken bowl?",
      evidence: [
        {
          id: "1",
          kind: "search_result",
          title: "Blog",
          url: "https://example.com/x",
          content: "Orange chicken has about 490 calories.",
        },
      ],
    });
    assert.equal(gate.evidenceSufficient, false);
    assert.equal(gate.needsMoreInvestigation, true);
    assert.match(gate.reason, /snippet/i);
  });

  it("accepts multi-page evidence with official bias", () => {
    const gate = evaluateResearchQuality({
      question: "Calories in orange chicken",
      evidence: [
        {
          id: "a",
          kind: "web_page",
          title: "Official nutrition",
          url: "https://www.pandaexpress.com/nutrition",
          content: "Orange Chicken 510 calories per serving official menu.",
        },
        {
          id: "b",
          kind: "web_page",
          title: "Nutritionix",
          url: "https://www.nutritionix.com/panda",
          content: "Orange chicken 490-520 cal depending on serving.",
        },
      ],
    });
    assert.equal(gate.needsMoreInvestigation, false);
    assert.ok(gate.confidence === "high" || gate.confidence === "medium");
  });
});

describe("conflicting evidence forces more investigation", () => {
  it("flags conflicting component calorie values", () => {
    const components = extractFactualComponents(
      "Panda Express bowl: half rice, half chow mein, orange chicken",
    );
    assert.ok(components.length >= 3);
    const facts = resolveComponentFacts({
      components,
      evidence: [
        {
          id: "1",
          content: "Half fried rice 310 calories. Half chow mein 300 calories.",
        },
        {
          id: "2",
          content: "Orange chicken 510 calories.",
        },
        {
          id: "3",
          content: "Orange Chicken 780 calories (large).",
        },
      ],
    });
    const orange = facts.find((f) => /orange/i.test(f.label));
    assert.ok(orange);
    assert.equal(orange!.conflicting, true);
    const gate = evaluateResearchQuality({
      question:
        "Panda Express bowl: half rice, half chow mein, orange chicken",
      evidence: [
        {
          id: "1",
          kind: "web_page",
          content: "Half fried rice 310 calories. Half chow mein 300 cal.",
        },
        {
          id: "2",
          kind: "web_page",
          content: "Orange chicken 510 calories. Orange chicken 780 calories.",
        },
      ],
    });
    assert.equal(gate.conflictingEvidence, true);
    assert.equal(gate.needsMoreInvestigation, true);
  });
});

describe("deterministic arithmetic totals", () => {
  it("sums verified components", () => {
    const facts = resolveComponentFacts({
      components: ["half fried rice", "half chow mein", "orange chicken"],
      evidence: [
        {
          id: "p",
          kind: "web_page",
          content:
            "Half fried rice 310 cal. Half chow mein 300 calories. Orange chicken 510 calories.",
        },
      ],
    });
    const sum = sumVerifiedComponents(facts);
    assert.ok(sum);
    assert.equal(sum!.verified, true);
    assert.equal(sum!.total, 1120);
    const text = formatComponentBreakdown({
      leadLabel: "total",
      facts,
      total: sum!.total,
    });
    assert.match(text, /About 1,?120 calories total/i);
    assert.match(text, /•/);
    assert.match(text, /\*\*Total:/);
  });
});

describe("that's incorrect, try again → deeper retry", () => {
  it("detects correction retries", () => {
    assert.equal(isCorrectionRetry("that's incorrect, try again"), true);
    assert.equal(isCorrectionRetry("try again"), true);
    assert.equal(isCorrectionRetry("hello"), false);
  });

  it("deterministic delta marks dissatisfaction + external retrieval", () => {
    const delta = resolveDeterministicDelta({
      previous: emptyConversationTurnState(),
      userMessage: "that's incorrect, try again",
    });
    assert.ok(delta);
    assert.equal(delta!.dissatisfaction, true);
    assert.equal(delta!.freshness, true);
    assert.equal(delta!.externalRetrievalRequired, true);
  });

  it("compileTurnProfile schedules deeper searches on dissatisfaction", () => {
    const prev = emptyConversationTurnState();
    const profile = compileTurnProfile({
      content: "that's incorrect, try again",
      conversationState: {
        ...prev,
        dissatisfactionSignal: true,
        freshnessRequirement: true,
        externalRetrievalRequired: true,
      },
    });
    assert.ok(profile.preRunTasks.some((t) => t.name === "web.search"));
    assert.equal(profile.budgets.earlySynthesizeWhenSufficient, false);
    assert.ok(deeperResearchQueries("orange chicken calories").length >= 2);
  });
});

describe("structured multi-item response shape", () => {
  it("maps multi-component bowls to calculation shape", () => {
    const shape = inferAnswerShape(
      "Panda Express bowl: half rice, half chow mein, orange chicken",
    );
    assert.equal(shape.kind, "calculation");
    assert.equal(shape.preferBullets, true);
    assert.match(shape.formatHint, /Total/i);
  });
});

describe("collapsed Sources row contract", () => {
  it("documents collapsed-by-default sources UI (no always-visible chips)", () => {
    const src = readRepo("../components/chat/AssistantMessage.tsx");
    assert.match(src, /ActionSourcesRow/);
    assert.match(src, /useState\(false\)/);
    assert.match(src, /Sources/);
    assert.match(src, /favicon/);
    assert.doesNotMatch(src, /Sources · \{unique\.length\}/);
  });
});

describe("mobile composer keyboard policy", () => {
  it("exposes dismissNativeKeyboard and ChatColumn autofocus empty chats only", () => {
    const mobile = readRepo("../lib/mobile-shell.ts");
    const composer = readRepo("../components/shell/Composer.tsx");
    const chat = readRepo("../components/shell/ChatColumn.tsx");
    assert.match(mobile, /export function dismissNativeKeyboard/);
    assert.match(composer, /dismissNativeKeyboard/);
    assert.match(composer, /suppressAutoFocusRef/);
    assert.match(chat, /autofocusComposer/);
    assert.match(chat, /!hasChatTurns/);
    assert.match(chat, /!overlay/);
  });
});
