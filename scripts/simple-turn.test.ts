/**
 * Simple turn runtime — regression / eval suite (zero network).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { hydrateTurn } from "../lib/ai/simple-turn/hydrate.ts";
import {
  planFromHydrateHeuristic,
  parsePlanJson,
} from "../lib/ai/simple-turn/plan.ts";
import {
  repairPlanCode,
  validateAndRepairPlan,
  validatePlan,
} from "../lib/ai/simple-turn/validate-plan.ts";
import { checkEvidence } from "../lib/ai/simple-turn/check.ts";
import { answerTurn } from "../lib/ai/simple-turn/answer.ts";
import {
  loadSimpleState,
  resetSimpleStateForTests,
  commitSimpleNotes,
} from "../lib/ai/simple-turn/state-store.ts";
import { isSimpleTurnRuntimeEnabled } from "../lib/ai/orchestrator/flags.ts";
import type { Plan, SimpleEvidence } from "../lib/ai/simple-turn/types.ts";

const FILLER = [
  "tell me about it",
  "what it offers",
  "what it's offering",
  "write me a summary",
  "look at it",
];

describe("simple turn runtime", () => {
  it("flag defaults off", () => {
    delete process.env.NEXT_PUBLIC_AI_SIMPLE_TURN_RUNTIME;
    assert.equal(isSimpleTurnRuntimeEnabled(), false);
  });

  it("vercel.com inspect plans WEB fetch without filler query", () => {
    resetSimpleStateForTests();
    const state = loadSimpleState({
      text: "Can you look at vercel.com and tell me about it?",
    });
    const hydrate = hydrateTurn(state);
    assert.ok(hydrate.urls.some((u) => u.domain.includes("vercel")));
    assert.ok(
      hydrate.resolved.some((r) => /vercel/i.test(r)),
      "should bind it → vercel.com",
    );

    const plan = planFromHydrateHeuristic(hydrate);
    const validated = validateAndRepairPlan({
      plan,
      hydrate,
      browser: "auto",
    });
    assert.equal(validated.failed, false);
    assert.ok(validated.plan.look?.some((l) => l.cap === "WEB"));
    for (const look of validated.plan.look ?? []) {
      for (const f of FILLER) {
        assert.ok(
          !look.q.toLowerCase().includes(f),
          `must not search filler "${f}": ${look.q}`,
        );
      }
      assert.ok(
        /vercel/i.test(look.q),
        `WEB lookup must target vercel: ${look.q}`,
      );
    }
  });

  it("canderhq.com review plans WEB URL fetch", () => {
    const state = loadSimpleState({
      text:
        "Can you review canderhq.com and write me a quick summary about what it's offering?",
    });
    const hydrate = hydrateTurn(state);
    const plan = planFromHydrateHeuristic(hydrate);
    const validated = validateAndRepairPlan({
      plan,
      hydrate,
      browser: "auto",
    });
    assert.equal(validated.failed, false);
    const web = validated.plan.look?.find((l) => l.cap === "WEB");
    assert.ok(web);
    assert.ok(/canderhq/i.test(web!.q));
    assert.ok(!FILLER.some((f) => web!.q.toLowerCase().includes(f)));
  });

  it("BYU follow-up hydrates topic from notes", () => {
    resetSimpleStateForTests();
    commitSimpleNotes("t-byu", {
      topic: "BYU Fall 2026",
      entities: ["BYU"],
      facts: ["Fall semester timing under discussion"],
    });
    const state = loadSimpleState({
      threadId: "t-byu",
      text: "What should I bring my first day?",
    });
    const hydrate = hydrateTurn(state);
    assert.equal(hydrate.topicHint, "BYU Fall 2026");
    assert.ok(
      hydrate.resolved.some((r) => /BYU Fall 2026/i.test(r)),
      hydrate.resolved.join("; "),
    );
    const plan = planFromHydrateHeuristic(hydrate);
    assert.ok(
      plan.look?.some((l) => /BYU|first day|2026/i.test(l.q)) || plan.fresh,
    );
  });

  it("distance + round-trip keeps CALC/WEB intent together", () => {
    const state = loadSimpleState({
      text: "How far is Cedar City from Lehi and how long there and back?",
    });
    const hydrate = hydrateTurn(state);
    const plan = planFromHydrateHeuristic(hydrate);
    assert.ok(
      plan.look?.some((l) => l.cap === "CALC") ||
        /far|distance|round/i.test(plan.intent),
    );
    assert.ok(plan.asks.length >= 1);
  });

  it("rejects fresh answer without retrieval", () => {
    const state = loadSimpleState({
      text: "When does BYU fall semester start this year?",
    });
    const hydrate = hydrateTurn(state);
    const bad: Plan = {
      intent: "BYU start date",
      asks: ["When does BYU start"],
      constraints: [],
      resolvedRefs: [],
      unresolvedRefs: [],
      fresh: true,
      answer: "It starts on August 23.",
    };
    const v = validatePlan({ plan: bad, hydrate, browser: "auto" });
    assert.ok(v.issues.includes("fresh_answer_without_retrieval"));
    const repaired = repairPlanCode({
      plan: bad,
      hydrate,
      issues: v.issues,
    });
    assert.ok(repaired.look?.some((l) => l.cap === "WEB"));
    assert.equal(repaired.answer, undefined);
  });

  it("plan validation rejects unbound URL", () => {
    const state = loadSimpleState({
      text: "Look at vercel.com and summarize it",
    });
    const hydrate = hydrateTurn(state);
    const bad: Plan = {
      intent: "tell me about it",
      asks: ["tell me about it"],
      constraints: [],
      resolvedRefs: [],
      unresolvedRefs: [],
      fresh: false,
      look: [{ cap: "WEB", q: "tell me about it" }],
    };
    const v = validatePlan({ plan: bad, hydrate, browser: "auto" });
    assert.ok(
      v.issues.some((i) => i.startsWith("url_unbound") || i === "filler_web_query"),
      v.issues.join(","),
    );
    const fixed = validateAndRepairPlan({
      plan: bad,
      hydrate,
      browser: "auto",
    });
    assert.equal(fixed.failed, false);
    assert.ok(fixed.plan.look?.some((l) => /vercel/i.test(l.q)));
  });

  it("fresh ask without evidence stays unresolved (no hallucination)", async () => {
    const state = loadSimpleState({
      text: "When does BYU fall semester start this year?",
    });
    const hydrate = hydrateTurn(state);
    const plan = planFromHydrateHeuristic(hydrate);
    plan.fresh = true;
    plan.look = [{ cap: "WEB", q: "BYU fall semester 2026" }];

    const check = checkEvidence({
      plan,
      hydrate,
      evidence: [],
      lookupsRun: [],
      round: 2,
    });
    assert.equal(check.unresolved, true);

    const packet = await answerTurn({
      plan,
      hydrate,
      accepted: [],
      unresolved: true,
      unresolvedReason: check.unresolvedReason,
      useHeuristicOnly: true,
    });
    assert.equal(packet.path, "unresolved");
    assert.ok(/couldn'?t retrieve|won'?t guess/i.test(packet.answer));
    assert.ok(!/August 23|September 6/i.test(packet.answer));
  });

  it("accepted WEB evidence can answer deterministically", async () => {
    const state = loadSimpleState({
      text: "When does BYU start this year?",
    });
    const hydrate = hydrateTurn(state);
    const plan: Plan = {
      intent: "BYU start date 2026",
      asks: ["When does BYU start"],
      constraints: [],
      resolvedRefs: [],
      unresolvedRefs: [],
      fresh: true,
      look: [{ cap: "WEB", q: "BYU fall 2026 start" }],
    };
    const evidence: SimpleEvidence[] = [
      {
        id: "ev1",
        cap: "WEB",
        query: "BYU fall 2026 start",
        title: "BYU Calendar",
        url: "https://byu.edu/calendar",
        content: "Classes begin August 25, 2026.",
        ok: true,
        accepted: false,
        retrievedAt: new Date().toISOString(),
        sourceTool: "web.search",
      },
    ];
    const check = checkEvidence({
      plan,
      hydrate,
      evidence,
      lookupsRun: plan.look!,
      round: 1,
    });
    assert.ok(check.accepted.length >= 1);

    const packet = await answerTurn({
      plan,
      hydrate,
      accepted: check.accepted,
      useHeuristicOnly: true,
    });
    assert.ok(packet.path === "deterministic" || packet.path === "fm_synthesis");
    assert.ok(/August 25/i.test(packet.answer));
  });

  it("parsePlanJson accepts valid schema", () => {
    const plan = parsePlanJson(
      JSON.stringify({
        intent: "inspect vercel.com and summarize",
        asks: ["Summarize vercel.com"],
        constraints: [],
        resolvedRefs: ["it = vercel.com"],
        unresolvedRefs: [],
        fresh: false,
        look: [{ cap: "WEB", q: "https://vercel.com" }],
      }),
    );
    assert.ok(plan);
    assert.equal(plan!.look![0]!.cap, "WEB");
  });
});
