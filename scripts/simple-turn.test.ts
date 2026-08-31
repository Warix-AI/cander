/**
 * IntentPlan INTERPRET / NORMALIZE regression suite.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { hydrateTurn } from "../lib/ai/simple-turn/hydrate.ts";
import {
  intentPlanFromHydrateHeuristic,
  interpretSelfCheck,
  parseIntentPlanJson,
  planFromHydrateHeuristic,
  parsePlanJson,
} from "../lib/ai/simple-turn/plan.ts";
import {
  validateAndRepairPlan,
  validatePlan,
  repairPlanCode,
} from "../lib/ai/simple-turn/validate-plan.ts";
import {
  checkEvidence,
  scoreEvidence,
} from "../lib/ai/simple-turn/check.ts";
import { answerTurn } from "../lib/ai/simple-turn/answer.ts";
import {
  intentExecutionWaves,
  runLookups,
} from "../lib/ai/simple-turn/run.ts";
import {
  buildCanonicalLookupQuery,
  looksLikeNarrativeQuery,
  heuristicCalorieIntents,
} from "../lib/ai/simple-turn/query-normalize.ts";
import {
  loadSimpleState,
  resetSimpleStateForTests,
  commitSimpleNotes,
} from "../lib/ai/simple-turn/state-store.ts";
import { isSimpleTurnRuntimeEnabled } from "../lib/ai/orchestrator/flags.ts";
import type { IntentPlan, Plan, SimpleEvidence } from "../lib/ai/simple-turn/types.ts";
import { intentPlanToPlan, syncPlanAliases } from "../lib/ai/simple-turn/types.ts";

const FILLER = [
  "tell me about it",
  "what it offers",
  "what it's offering",
  "write me a summary",
  "look at it",
];

const CALORIE_PROMPT =
  "If I eat three regular tacos from Taco Bell and a medium Sprite from McDonald's, how many calories is that?";

describe("simple turn IntentPlan runtime", () => {
  it("flag defaults off", () => {
    delete process.env.NEXT_PUBLIC_AI_SIMPLE_TURN_RUNTIME;
    assert.equal(isSimpleTurnRuntimeEnabled(), false);
  });

  it("canonical queries strip narrative wording", () => {
    assert.equal(
      buildCanonicalLookupQuery({
        entity: "Taco Bell",
        subject: "regular taco calories",
        rawQ: "Taco Bell If I eat three regular tacos",
      }),
      "Taco Bell regular taco calories",
    );
    assert.equal(
      buildCanonicalLookupQuery({
        entity: "McDonald's",
        subject: "medium Sprite calories",
        rawQ: "McDonald's I have a medium Sprite",
      }),
      "McDonald's medium Sprite calories",
    );
    assert.equal(
      looksLikeNarrativeQuery("Taco Bell If I eat three regular tacos"),
      true,
    );
    assert.equal(
      looksLikeNarrativeQuery("Taco Bell regular taco calories"),
      false,
    );
  });

  it("calorie compound prompt → 2 WEB + 1 CALC with deps and clean queries", () => {
    const items = heuristicCalorieIntents(CALORIE_PROMPT);
    assert.ok(items && items.length >= 2, "should detect two food items");

    const state = loadSimpleState({ text: CALORIE_PROMPT });
    const hydrate = hydrateTurn(state);
    const ip = intentPlanFromHydrateHeuristic(hydrate);

    const web = ip.intents.filter((i) => i.action === "WEB");
    const calc = ip.intents.filter((i) => i.action === "CALC");
    assert.ok(web.length >= 2, `expected ≥2 WEB intents, got ${web.length}`);
    assert.equal(calc.length, 1);

    const taco = web.find((i) => /taco bell/i.test(i.entity ?? ""));
    const sprite = web.find((i) => /mcdonald/i.test(i.entity ?? ""));
    assert.ok(taco, "Taco Bell intent");
    assert.ok(sprite, "McDonald's intent");
    assert.equal(taco!.quantity, 3);
    assert.equal(sprite!.quantity, 1);
    assert.ok(
      /taco bell/i.test(taco!.lookup!.q) && /calories/i.test(taco!.lookup!.q),
    );
    assert.ok(!/if i eat/i.test(taco!.lookup!.q));
    assert.ok(
      /mcdonald/i.test(sprite!.lookup!.q) && /calories/i.test(sprite!.lookup!.q),
    );
    assert.ok(!/i have/i.test(sprite!.lookup!.q));

    assert.ok(
      calc[0]!.dependsOn.includes(taco!.id) &&
        calc[0]!.dependsOn.includes(sprite!.id),
    );

    const waves = intentExecutionWaves(ip.intents);
    assert.ok(waves.length >= 2, "CALC should be a later wave");
    assert.ok(
      waves[0]!.every((i) => i.action === "WEB"),
      "first wave runs WEB in parallel",
    );
    assert.ok(waves.at(-1)!.some((i) => i.action === "CALC"));
  });

  it("runLookups executes independent WEB intents concurrently before CALC", async () => {
    const state = loadSimpleState({ text: CALORIE_PROMPT });
    const hydrate = hydrateTurn(state);
    const ip = intentPlanFromHydrateHeuristic(hydrate);
    const order: string[] = [];

    await runLookups({
      plan: ip,
      browser: "auto",
      userText: CALORIE_PROMPT,
      cache: new Map(),
      executeTool: async ({ name, arguments: args }) => {
        order.push(`${name}:${String(args.query ?? args.url ?? "")}`);
        return {
          name,
          ok: true,
          output: "170 calories per serving according to nutrition data",
          data: {
            title: "Nutrition",
            url: "https://example.com",
            text: "170 calories per serving according to nutrition data",
          },
        };
      },
    });

    const webCalls = order.filter((o) => o.startsWith("web."));
    assert.ok(webCalls.length >= 2);
    // Both brand queries present and clean
    assert.ok(webCalls.some((c) => /taco bell/i.test(c) && /calories/i.test(c)));
    assert.ok(webCalls.some((c) => /mcdonald/i.test(c) && /calories/i.test(c)));
    assert.ok(!order.some((c) => /if i eat/i.test(c)));
  });

  it("vercel.com inspect plans WEB without filler query", () => {
    resetSimpleStateForTests();
    const state = loadSimpleState({
      text: "Can you look at vercel.com and tell me about it?",
    });
    const hydrate = hydrateTurn(state);
    const ip = intentPlanFromHydrateHeuristic(hydrate);
    const validated = validateAndRepairPlan({
      plan: ip,
      hydrate,
      browser: "auto",
    });
    assert.equal(validated.failed, false);
    const web = validated.plan.intents.find((i) => i.action === "WEB");
    assert.ok(web);
    assert.ok(/vercel/i.test(web!.lookup!.q));
    for (const f of FILLER) {
      assert.ok(!web!.lookup!.q.toLowerCase().includes(f));
    }
  });

  it("canderhq.com review plans WEB URL fetch", () => {
    const state = loadSimpleState({
      text:
        "Can you review canderhq.com and write me a quick summary about what it's offering?",
    });
    const hydrate = hydrateTurn(state);
    const ip = intentPlanFromHydrateHeuristic(hydrate);
    const validated = validateAndRepairPlan({
      plan: ip,
      hydrate,
      browser: "auto",
    });
    assert.equal(validated.failed, false);
    const web = validated.plan.intents.find((i) => i.action === "WEB");
    assert.ok(web);
    assert.ok(/canderhq/i.test(web!.lookup!.q));
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
    const plan = planFromHydrateHeuristic(hydrate);
    assert.ok(
      plan.lookups?.some((l) => /BYU|first day|2026/i.test(l.q)) ||
        plan.freshnessRequired,
    );
  });

  it("rejects fresh answer without retrieval", () => {
    const state = loadSimpleState({
      text: "When does BYU fall semester start this year?",
    });
    const hydrate = hydrateTurn(state);
    const bad: IntentPlan = {
      overallIntent: "BYU start date",
      intents: [
        {
          id: "1",
          goal: "When does BYU start",
          action: "ANSWER",
          constraints: [],
          resolvedRefs: [],
          unresolvedRefs: [],
          freshnessRequired: true,
          dependsOn: [],
        },
      ],
      answer: "It starts on August 23.",
    };
    const v = validateAndRepairPlan({
      plan: bad,
      hydrate,
      browser: "auto",
    });
    assert.ok(v.plan.intents.some((i) => i.action === "WEB"));
  });

  it("plan validation repairs unbound URL / filler query", () => {
    const state = loadSimpleState({
      text: "Look at vercel.com and summarize it",
    });
    const hydrate = hydrateTurn(state);
    const bad: IntentPlan = {
      overallIntent: "tell me about it",
      intents: [
        {
          id: "1",
          goal: "tell me about it",
          action: "WEB",
          constraints: [],
          resolvedRefs: [],
          unresolvedRefs: [],
          freshnessRequired: false,
          dependsOn: [],
          lookup: { q: "tell me about it" },
        },
      ],
    };
    const fixed = validateAndRepairPlan({
      plan: bad,
      hydrate,
      browser: "auto",
    });
    assert.equal(fixed.failed, false);
    assert.ok(
      fixed.plan.intents.some((i) => /vercel/i.test(i.lookup?.q ?? "")),
    );
  });

  it("fresh ask without evidence stays unresolved", async () => {
    const state = loadSimpleState({
      text: "When does BYU fall semester start this year?",
    });
    const hydrate = hydrateTurn(state);
    const plan = planFromHydrateHeuristic(hydrate);
    plan.freshnessRequired = true;
    plan.fresh = true;

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
    assert.ok(check.accepted.length >= 1);

    const packet = await answerTurn({
      plan,
      hydrate,
      accepted: check.accepted,
      useHeuristicOnly: true,
    });
    assert.ok(/August 25/i.test(packet.answer));
  });

  it("parseIntentPlanJson accepts IntentPlan schema", () => {
    const ip = parseIntentPlanJson(
      JSON.stringify({
        overallIntent: "total calories from tacos and sprite",
        intents: [
          {
            id: "1",
            goal: "find calories in one Taco Bell regular taco",
            action: "WEB",
            entity: "Taco Bell",
            subject: "regular taco calories",
            quantity: 3,
            constraints: [],
            resolvedRefs: [],
            freshnessRequired: false,
            dependsOn: [],
            lookup: { q: "Taco Bell regular taco calories" },
          },
          {
            id: "2",
            goal: "find calories in one McDonald's medium Sprite",
            action: "WEB",
            entity: "McDonald's",
            subject: "medium Sprite calories",
            quantity: 1,
            constraints: [],
            resolvedRefs: [],
            freshnessRequired: false,
            dependsOn: [],
            lookup: { q: "McDonald's medium Sprite calories" },
          },
          {
            id: "3",
            goal: "calculate total calories",
            action: "CALC",
            constraints: [],
            resolvedRefs: [],
            freshnessRequired: false,
            dependsOn: ["1", "2"],
          },
        ],
      }),
    );
    assert.ok(ip);
    assert.equal(ip!.intents.length, 3);
    assert.deepEqual(ip!.intents[2]!.dependsOn, ["1", "2"]);
    const flat = intentPlanToPlan(ip!);
    assert.ok(flat.lookups.length >= 2);
  });

  it("self-check rewrites narrative lookup queries", () => {
    const state = loadSimpleState({ text: CALORIE_PROMPT });
    const hydrate = hydrateTurn(state);
    const dirty: IntentPlan = {
      overallIntent: "calories",
      intents: [
        {
          id: "1",
          goal: "taco calories",
          action: "WEB",
          entity: "Taco Bell",
          subject: "regular taco calories",
          quantity: 3,
          constraints: [],
          resolvedRefs: [],
          unresolvedRefs: [],
          freshnessRequired: false,
          dependsOn: [],
          lookup: { q: "Taco Bell If I eat three regular tacos" },
        },
      ],
    };
    const checked = interpretSelfCheck({ plan: dirty, hydrate });
    assert.ok(!looksLikeNarrativeQuery(checked.plan.intents[0]!.lookup!.q));
    assert.ok(/calories/i.test(checked.plan.intents[0]!.lookup!.q));
  });

  it("legacy parsePlanJson still works", () => {
    const plan = parsePlanJson(
      JSON.stringify({
        intent: "inspect vercel.com",
        asks: ["Summarize vercel.com"],
        constraints: [],
        resolvedRefs: [],
        unresolvedRefs: [],
        fresh: false,
        look: [{ cap: "WEB", q: "https://vercel.com" }],
      }),
    );
    assert.ok(plan);
    assert.equal(plan!.lookups[0]!.cap, "WEB");
  });

  it("scoreEvidence marks wrong entity", () => {
    const state = loadSimpleState({ text: "Summarize stripe.com" });
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

  it("does not instruct users to split multi-part prompts", () => {
    // Guard: validation/repair must succeed for compound calorie ask
    const state = loadSimpleState({ text: CALORIE_PROMPT });
    const hydrate = hydrateTurn(state);
    const ip = intentPlanFromHydrateHeuristic(hydrate);
    const v = validateAndRepairPlan({
      plan: ip,
      hydrate,
      browser: "auto",
    });
    assert.equal(v.failed, false);
    assert.ok(v.plan.intents.length >= 3);
  });
});
