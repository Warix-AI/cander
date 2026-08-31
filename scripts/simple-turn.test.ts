/**
 * Simple turn runtime — INTERPRET / VERIFY regression suite (zero network).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { hydrateTurn } from "../lib/ai/simple-turn/hydrate.ts";
import {
  planFromHydrateHeuristic,
  parsePlanJson,
  interpretSelfCheck,
} from "../lib/ai/simple-turn/plan.ts";
import {
  repairPlanCode,
  validateAndRepairPlan,
  validatePlan,
} from "../lib/ai/simple-turn/validate-plan.ts";
import {
  checkEvidence,
  scoreEvidence,
  isSensitiveCurrentFact,
  buildCorroborationLookups,
  authorityScore,
} from "../lib/ai/simple-turn/check.ts";
import { answerTurn } from "../lib/ai/simple-turn/answer.ts";
import {
  loadSimpleState,
  resetSimpleStateForTests,
  commitSimpleNotes,
} from "../lib/ai/simple-turn/state-store.ts";
import { isSimpleTurnRuntimeEnabled } from "../lib/ai/orchestrator/flags.ts";
import type { Plan, SimpleEvidence } from "../lib/ai/simple-turn/types.ts";
import { syncPlanAliases } from "../lib/ai/simple-turn/types.ts";

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
    assert.ok(validated.plan.lookups?.some((l) => l.cap === "WEB"));
    assert.equal(validated.plan.answerShape, "summary");
    assert.ok(validated.plan.entities.some((e) => /vercel/i.test(e)));
    assert.ok(validated.plan.expectedEvidence.length >= 1);
    for (const look of validated.plan.lookups ?? []) {
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
    const web = validated.plan.lookups?.find((l) => l.cap === "WEB");
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
      plan.lookups?.some((l) => /BYU|first day|2026/i.test(l.q)) ||
        plan.freshnessRequired,
    );
  });

  it("distance + round-trip keeps CALC/WEB intent together", () => {
    const state = loadSimpleState({
      text: "How far is Cedar City from Lehi and how long there and back?",
    });
    const hydrate = hydrateTurn(state);
    const plan = planFromHydrateHeuristic(hydrate);
    assert.ok(
      plan.lookups?.some((l) => l.cap === "CALC") ||
        /far|distance|round/i.test(plan.intent),
    );
    assert.ok(plan.asks.length >= 1);
    assert.ok(
      plan.answerShape === "mixed" ||
        plan.answerShape === "direct" ||
        plan.asks.length >= 2,
    );
  });

  it("rejects fresh answer without retrieval", () => {
    const state = loadSimpleState({
      text: "When does BYU fall semester start this year?",
    });
    const hydrate = hydrateTurn(state);
    const bad = syncPlanAliases({
      intent: "BYU start date",
      asks: ["When does BYU start"],
      constraints: [],
      entities: ["BYU"],
      resolvedRefs: [],
      unresolvedRefs: [],
      temporalContext: [],
      freshnessRequired: true,
      fresh: true,
      expectedEvidence: [],
      answerShape: "direct",
      lookups: [],
      answer: "It starts on August 23.",
    });
    const v = validatePlan({ plan: bad, hydrate, browser: "auto" });
    assert.ok(v.issues.includes("fresh_answer_without_retrieval"));
    const repaired = repairPlanCode({
      plan: bad,
      hydrate,
      issues: v.issues,
    });
    assert.ok(repaired.lookups?.some((l) => l.cap === "WEB"));
    assert.equal(repaired.answer, undefined);
  });

  it("plan validation rejects unbound URL", () => {
    const state = loadSimpleState({
      text: "Look at vercel.com and summarize it",
    });
    const hydrate = hydrateTurn(state);
    const bad = syncPlanAliases({
      intent: "tell me about it",
      asks: ["tell me about it"],
      constraints: [],
      entities: [],
      resolvedRefs: [],
      unresolvedRefs: [],
      temporalContext: [],
      freshnessRequired: false,
      fresh: false,
      expectedEvidence: [],
      answerShape: "summary",
      lookups: [{ cap: "WEB", q: "tell me about it" }],
    });
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
    assert.ok(fixed.plan.lookups?.some((l) => /vercel/i.test(l.q)));
  });

  it("fresh ask without evidence stays unresolved (no hallucination)", async () => {
    const state = loadSimpleState({
      text: "When does BYU fall semester start this year?",
    });
    const hydrate = hydrateTurn(state);
    const plan = planFromHydrateHeuristic(hydrate);
    plan.freshnessRequired = true;
    plan.fresh = true;
    plan.lookups = [{ cap: "WEB", q: "BYU fall semester 2026" }];
    plan.look = plan.lookups;

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
    const plan = syncPlanAliases({
      intent: "BYU start date 2026",
      asks: ["When does BYU start"],
      constraints: [],
      entities: ["BYU"],
      resolvedRefs: [],
      unresolvedRefs: [],
      temporalContext: ['"this year" → 2026'],
      freshnessRequired: true,
      fresh: true,
      expectedEvidence: ["BYU fall semester start date for 2026"],
      answerShape: "direct",
      lookups: [{ cap: "WEB", q: "BYU fall 2026 start" }],
    });
    const evidence: SimpleEvidence[] = [
      {
        id: "ev1",
        cap: "WEB",
        query: "BYU fall 2026 start",
        title: "BYU Academic Calendar",
        url: "https://byu.edu/calendar",
        content: "Classes begin August 25, 2026 for Fall Semester.",
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
      lookupsRun: plan.lookups,
      round: 1,
    });
    assert.ok(check.accepted.length >= 1, check.rejected.map((r) => r.rejectReason).join(","));
    assert.ok((check.accepted[0]!.verify?.score ?? 0) >= 0.45);

    const packet = await answerTurn({
      plan,
      hydrate,
      accepted: check.accepted,
      useHeuristicOnly: true,
    });
    assert.ok(packet.path === "deterministic" || packet.path === "fm_synthesis");
    assert.ok(/August 25/i.test(packet.answer));
  });

  it("parsePlanJson accepts expanded INTERPRET schema", () => {
    const plan = parsePlanJson(
      JSON.stringify({
        intent: "inspect vercel.com and summarize",
        asks: ["Summarize vercel.com"],
        constraints: [],
        entities: ["vercel.com"],
        resolvedRefs: ["it = vercel.com"],
        unresolvedRefs: [],
        temporalContext: [],
        freshnessRequired: false,
        expectedEvidence: ["Page content describing Vercel offerings"],
        answerShape: "summary",
        lookups: [{ cap: "WEB", q: "https://vercel.com", parallelGroup: "url" }],
      }),
    );
    assert.ok(plan);
    assert.equal(plan!.lookups[0]!.cap, "WEB");
    assert.equal(plan!.answerShape, "summary");
    assert.equal(plan!.fresh, false);
    assert.ok(plan!.look?.length);
  });

  it("INTERPRET self-check repairs dropped freshness and entities", () => {
    const state = loadSimpleState({
      text: "When does BYU fall semester start this year?",
    });
    const hydrate = hydrateTurn(state);
    const thin = syncPlanAliases({
      intent: "BYU start",
      asks: ["When does BYU start"],
      constraints: [],
      entities: [],
      resolvedRefs: [],
      unresolvedRefs: [],
      temporalContext: [],
      freshnessRequired: false,
      fresh: false,
      expectedEvidence: [],
      answerShape: "direct",
      lookups: [{ cap: "WEB", q: "BYU start" }],
    });
    const checked = interpretSelfCheck({ plan: thin, hydrate });
    assert.equal(checked.plan.freshnessRequired, true);
    assert.ok(checked.plan.expectedEvidence.length >= 1);
  });

  it("VERIFY rejects stale-year evidence and asks refine", () => {
    const state = loadSimpleState({
      text: "When does BYU fall semester start this year?",
    });
    const hydrate = hydrateTurn(state);
    const plan = planFromHydrateHeuristic(hydrate);
    plan.freshnessRequired = true;
    plan.fresh = true;
    plan.entities = ["BYU"];
    plan.lookups = [{ cap: "WEB", q: "BYU fall semester" }];
    plan.look = plan.lookups;

    const stale: SimpleEvidence[] = [
      {
        id: "ev_stale",
        cap: "WEB",
        query: "BYU fall",
        title: "Old calendar",
        url: "https://example.com/2022",
        content: "BYU classes began August 29, 2022.",
        ok: true,
        accepted: false,
        retrievedAt: new Date().toISOString(),
        sourceTool: "web.search",
      },
    ];
    const check = checkEvidence({
      plan,
      hydrate,
      evidence: stale,
      lookupsRun: plan.lookups,
      round: 1,
    });
    assert.equal(check.accepted.length, 0);
    assert.equal(check.needsRefine, true);
    assert.ok(check.refineLookups?.some((l) => /2026|official/i.test(l.q)));
  });

  it("VERIFY requests corroboration for weak sensitive facts", () => {
    const state = loadSimpleState({
      text: "What is the BYU football schedule this year?",
    });
    const hydrate = hydrateTurn(state);
    const plan = syncPlanAliases({
      intent: "BYU football schedule 2026",
      asks: ["What is the BYU football schedule"],
      constraints: [],
      entities: ["BYU"],
      resolvedRefs: [],
      unresolvedRefs: [],
      temporalContext: ['"this year" → 2026'],
      freshnessRequired: true,
      fresh: true,
      expectedEvidence: ["2026 BYU football game dates"],
      answerShape: "breakdown",
      lookups: [{ cap: "WEB", q: "BYU football schedule 2026" }],
    });
    assert.equal(isSensitiveCurrentFact(plan, hydrate), true);

    const weak: SimpleEvidence[] = [
      {
        id: "ev_blog",
        cap: "WEB",
        query: "BYU football schedule 2026",
        title: "Fan blog schedule rumor",
        url: "https://random-fan-blog.example/byu",
        content:
          "BYU football schedule this year includes games in September 2026 against several opponents according to rumors.",
        ok: true,
        accepted: false,
        retrievedAt: new Date().toISOString(),
        sourceTool: "web.search",
      },
    ];
    const check = checkEvidence({
      plan,
      hydrate,
      evidence: weak,
      lookupsRun: plan.lookups,
      round: 1,
      corroborationDone: false,
    });
    // May accept with low authority then ask corroboration, or reject — either is ok
    if (check.accepted.length) {
      assert.equal(check.needsCorroboration, true);
      assert.ok((check.corroborateLookups?.length ?? 0) >= 1);
      const corr = buildCorroborationLookups({
        plan,
        hydrate,
        accepted: check.accepted,
      });
      assert.ok(/official|BYU|2026/i.test(corr[0]!.q));
    } else {
      assert.equal(check.needsRefine, true);
    }
  });

  it("authorityScore prefers .edu / official hosts", () => {
    const plan = syncPlanAliases({
      intent: "BYU date",
      asks: ["start"],
      constraints: [],
      entities: ["BYU"],
      resolvedRefs: [],
      unresolvedRefs: [],
      temporalContext: [],
      freshnessRequired: true,
      fresh: true,
      expectedEvidence: [],
      answerShape: "direct",
      lookups: [],
    });
    const edu: SimpleEvidence = {
      id: "1",
      cap: "WEB",
      query: "q",
      title: "BYU",
      url: "https://byu.edu/calendar",
      content: "official calendar",
      ok: true,
      accepted: false,
      retrievedAt: new Date().toISOString(),
      sourceTool: "web.read",
    };
    const blog: SimpleEvidence = {
      ...edu,
      id: "2",
      url: "https://random-blog.example/post",
      sourceTool: "web.search",
    };
    assert.ok(authorityScore(edu, plan) > authorityScore(blog, plan));
  });

  it("scoreEvidence marks wrong entity", () => {
    const state = loadSimpleState({
      text: "Summarize stripe.com",
    });
    const hydrate = hydrateTurn(state);
    const plan = planFromHydrateHeuristic(hydrate);
    const wrong: SimpleEvidence = {
      id: "w",
      cap: "WEB",
      query: "stripe",
      title: "PayPal",
      url: "https://paypal.com",
      content: "PayPal is a payments company unrelated to the ask.",
      ok: true,
      accepted: false,
      retrievedAt: new Date().toISOString(),
      sourceTool: "web.search",
    };
    const score = scoreEvidence({
      evidence: wrong,
      plan,
      hydrate,
      alreadyAccepted: [],
    });
    assert.equal(score.entityOk, false);
  });
});
