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
  classifyDeliberationDepth,
  buildInterpretInstructions,
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
  webSearchArgsForLookup,
  executeLookup,
} from "../lib/ai/simple-turn/cap-router.ts";
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
import {
  intentPlanToPlan,
  normalizeIntentPlan,
  syncPlanAliases,
} from "../lib/ai/simple-turn/types.ts";

const FILLER = [
  "tell me about it",
  "what it offers",
  "what it's offering",
  "write me a summary",
  "look at it",
];

const CALORIE_PROMPT =
  "If I eat three regular tacos from Taco Bell and a medium Sprite from McDonald's, how many calories is that?";

const BYU_CONDITIONAL =
  "When is BYU's next football game? Do they play Utah this year? If they do, add it to my calendar.";

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

  it("open-web WEB intents always use Exa type=deep; URL stays direct; Exa text passthrough", async () => {
    const deepArgs = webSearchArgsForLookup({
      cap: "WEB",
      q: "Taco Bell regular taco calories",
    });
    assert.equal(deepArgs.retrievalMode, "deep");
    assert.ok(!deepArgs.deeper);
    assert.ok(!deepArgs.escalate);
    assert.ok(!/if i eat/i.test(String(deepArgs.query)));

    // URL path must not invoke search first
    const calls: string[] = [];
    await executeLookup({
      lookup: { cap: "WEB", q: "https://vercel.com" },
      cache: new Map(),
      executeTool: async ({ name, arguments: args }) => {
        calls.push(
          `${name}:${String(args.retrievalMode ?? args.url ?? args.query ?? "")}`,
        );
        return {
          name,
          ok: true,
          output: "Vercel is a deployment platform for frontend apps.",
          data: {
            title: "Vercel",
            url: "https://vercel.com",
            finalUrl: "https://vercel.com",
            text: "Vercel is a deployment platform for frontend apps.",
          },
        };
      },
    });
    assert.ok(calls[0]?.startsWith("web.read:"));
    assert.ok(!calls.some((c) => c.startsWith("web.search:")));

    // Open-web concurrent intents pass deep + canonical queries
    const state = loadSimpleState({ text: CALORIE_PROMPT });
    const hydrate = hydrateTurn(state);
    const ip = intentPlanFromHydrateHeuristic(hydrate);
    const searchCalls: Array<Record<string, unknown>> = [];
    await runLookups({
      plan: ip,
      browser: "auto",
      userText: CALORIE_PROMPT,
      cache: new Map(),
      executeTool: async ({ name, arguments: args }) => {
        if (name === "web.search") searchCalls.push({ ...args });
        return {
          name,
          ok: true,
          output: "Grounded retrieval answer for “q”:\n170 calories per serving.\n\nUse this grounded answer.",
          data: {
            title: "Nutrition",
            url: "https://example.com",
            directAnswer: "170 calories per serving.",
            text: "170 calories per serving.",
          },
        };
      },
    });
    assert.ok(searchCalls.length >= 2);
    for (const c of searchCalls) {
      assert.equal(c.retrievalMode, "deep");
      assert.ok(!/if i eat|how many calories is that/i.test(String(c.query)));
    }

    // Validated Exa answer returned as-is (no FM rewrite)
    const packet = await answerTurn({
      plan: intentPlanToPlan(ip),
      hydrate,
      accepted: [
        {
          id: "e1",
          cap: "WEB",
          query: "Taco Bell regular taco calories",
          title: "Nutrition",
          url: "https://example.com",
          content: "A Taco Bell regular taco has about 170 calories.",
          ok: true,
          accepted: true,
          retrievedAt: new Date().toISOString(),
          sourceTool: "web.search",
        },
      ],
      useHeuristicOnly: false,
      generate: async () => {
        throw new Error("FM must not rewrite Exa web answers");
      },
    });
    assert.equal(packet.path, "exa_deep");
    assert.match(packet.answer, /170 calories/i);
  });

  it("classifies deliberation depth adaptively", () => {
    const simple = hydrateTurn(
      loadSimpleState({ text: "What is the capital of Utah?" }),
    );
    assert.equal(
      classifyDeliberationDepth({
        userText: simple.userText,
        hydrate: simple,
      }),
      "SIMPLE",
    );

    const normal = hydrateTurn(
      loadSimpleState({
        text: "When is BYU's next game? Do they play Utah this year?",
      }),
    );
    assert.equal(
      classifyDeliberationDepth({
        userText: normal.userText,
        hydrate: normal,
      }),
      "NORMAL",
    );

    const complex = hydrateTurn(
      loadSimpleState({ text: BYU_CONDITIONAL }),
    );
    assert.equal(
      classifyDeliberationDepth({
        userText: complex.userText,
        hydrate: complex,
      }),
      "COMPLEX",
    );

    const instructions = buildInterpretInstructions("COMPLEX");
    assert.ok(/Deliberation depth: COMPLEX/i.test(instructions));
    assert.ok(/condition/i.test(instructions));
    assert.ok(/needsFrom/i.test(instructions));
    assert.ok(/Do NOT expose deliberation/i.test(instructions));
  });

  it("BYU conditional calendar → parallel WEB + conditioned CALENDAR", () => {
    const state = loadSimpleState({ text: BYU_CONDITIONAL });
    const hydrate = hydrateTurn(state);
    assert.equal(
      classifyDeliberationDepth({
        userText: BYU_CONDITIONAL,
        hydrate,
      }),
      "COMPLEX",
    );

    const ip = intentPlanFromHydrateHeuristic(hydrate);
    const web = ip.intents.filter((i) => i.action === "WEB");
    const cal = ip.intents.find((i) => i.action === "CALENDAR");
    assert.ok(web.length >= 2);
    assert.ok(cal);
    assert.ok(cal!.dependsOn.includes("2") || cal!.condition?.intentId === "2");
    assert.equal(cal!.condition?.operator, "exists");
    assert.ok(cal!.needsFrom?.fields.includes("date"));
    assert.ok(cal!.needsFrom?.fields.some((f) => /time|kickoff/i.test(f)));
    assert.ok(
      ip.intents.some((i) =>
        i.resolvedRefs.some((r) => /they\s*=\s*BYU/i.test(r)),
      ),
    );

    const waves = intentExecutionWaves(ip.intents);
    assert.ok(waves[0]!.every((i) => i.action === "WEB"));
    assert.ok(waves.at(-1)!.some((i) => i.action === "CALENDAR"));

    for (const w of web) {
      assert.ok(w.lookup?.q);
      assert.ok(!looksLikeNarrativeQuery(w.lookup!.q));
      assert.ok(!/if they do/i.test(w.lookup!.q));
    }
  });

  it("runLookups skips calendar when condition fails; runs when it passes", async () => {
    const state = loadSimpleState({ text: BYU_CONDITIONAL });
    const hydrate = hydrateTurn(state);
    const base = intentPlanFromHydrateHeuristic(hydrate);
    // Use equals so a successful "they don't play" answer yields SKIPPED_BY_CONDITION
    const ip = normalizeIntentPlan({
      ...base,
      intents: base.intents.map((intent) =>
        intent.action === "CALENDAR"
          ? {
              ...intent,
              condition: {
                intentId: "2",
                operator: "equals" as const,
                value: "play utah",
              },
            }
          : intent,
      ),
    });

    const skipped = await runLookups({
      plan: ip,
      browser: "auto",
      userText: BYU_CONDITIONAL,
      cache: new Map(),
      executeTool: async ({ arguments: args }) => {
        const q = String(args.query ?? "");
        if (/utah/i.test(q)) {
          return {
            name: "web.search",
            ok: true,
            output:
              "BYU does not face Utah on the 2026 football schedule this year.",
            data: {
              title: "Schedule",
              url: "https://byucougars.com",
              text: "BYU does not face Utah on the 2026 football schedule this year.",
            },
          };
        }
        return {
          name: "web.search",
          ok: true,
          output: "BYU plays next Saturday at LaVell Edwards Stadium, 7:00 PM",
          data: {
            title: "BYU schedule",
            url: "https://byucougars.com",
            text: "BYU plays next Saturday at LaVell Edwards Stadium, 7:00 PM",
          },
        };
      },
    });
    const calSkipped = skipped.intentResults.find(
      (r) => r.intent.action === "CALENDAR",
    );
    assert.ok(calSkipped);
    assert.equal(calSkipped!.status, "SKIPPED_BY_CONDITION");

    // Upstream success matching condition → calendar runs with needsFrom
    const okRun = await runLookups({
      plan: ip,
      browser: "auto",
      userText: BYU_CONDITIONAL,
      cache: new Map(),
      executeTool: async ({ arguments: args }) => {
        const q = String(args.query ?? "");
        if (/utah/i.test(q)) {
          return {
            name: "web.search",
            ok: true,
            output:
              "BYU will play Utah — October 18, 2026, kickoff 8:00 PM at Rice-Eccles Stadium",
            data: {
              title: "BYU vs Utah",
              url: "https://byucougars.com",
              text: "BYU will play Utah — October 18, 2026, kickoff 8:00 PM at Rice-Eccles Stadium",
            },
          };
        }
        return {
          name: "web.search",
          ok: true,
          output: "Next BYU game is Saturday",
          data: {
            title: "Next game",
            url: "https://byucougars.com",
            text: "Next BYU game is Saturday",
          },
        };
      },
    });
    const calOk = okRun.intentResults.find((r) => r.intent.action === "CALENDAR");
    assert.ok(calOk);
    assert.equal(calOk!.status, "succeeded");
    assert.ok(calOk!.needsPayload);
  });

  it("BLOCKED_UPSTREAM_FAILED when dependency fails before conditioned write", async () => {
    const ip: IntentPlan = {
      overallIntent: "add game if found",
      intents: [
        {
          id: "1",
          goal: "find game",
          action: "WEB",
          constraints: [],
          resolvedRefs: [],
          unresolvedRefs: [],
          freshnessRequired: true,
          dependsOn: [],
          lookup: { q: "BYU vs Utah 2026" },
        },
        {
          id: "2",
          goal: "add to calendar",
          action: "CALENDAR",
          constraints: [],
          resolvedRefs: [],
          unresolvedRefs: [],
          freshnessRequired: false,
          dependsOn: ["1"],
          condition: { intentId: "1", operator: "exists" },
          needsFrom: {
            intentId: "1",
            fields: ["title", "date"],
          },
          lookup: { q: "calendar event" },
        },
      ],
    };
    const run = await runLookups({
      plan: normalizeIntentPlan(ip),
      browser: "auto",
      userText: "If they play Utah add it",
      cache: new Map(),
      executeTool: async () => ({
        name: "web.search",
        ok: false,
        output: "",
      }),
    });
    const cal = run.intentResults.find((r) => r.intent.id === "2");
    assert.equal(cal?.status, "BLOCKED_UPSTREAM_FAILED");
  });

  it("parseIntentPlanJson accepts condition and needsFrom", () => {
    const ip = parseIntentPlanJson(
      JSON.stringify({
        overallIntent: "BYU schedule + calendar",
        intents: [
          {
            id: "1",
            goal: "next BYU game",
            action: "WEB",
            constraints: [],
            resolvedRefs: [],
            freshnessRequired: true,
            dependsOn: [],
            lookup: { q: "BYU next football game 2026" },
          },
          {
            id: "2",
            goal: "BYU vs Utah",
            action: "WEB",
            constraints: [],
            resolvedRefs: ["they = BYU"],
            freshnessRequired: true,
            dependsOn: [],
            lookup: { q: "BYU vs Utah football schedule 2026" },
          },
          {
            id: "3",
            goal: "add to calendar",
            action: "CALENDAR",
            constraints: [],
            resolvedRefs: [],
            freshnessRequired: false,
            dependsOn: ["2"],
            condition: { intentId: "2", operator: "exists" },
            needsFrom: {
              intentId: "2",
              fields: ["title", "date", "kickoff time", "location"],
            },
          },
        ],
      }),
    );
    assert.ok(ip);
    assert.equal(ip!.intents[2]!.condition?.intentId, "2");
    assert.ok(ip!.intents[2]!.dependsOn.includes("2"));
    assert.deepEqual(ip!.intents[2]!.needsFrom?.fields.slice(0, 2), [
      "title",
      "date",
    ]);
  });
});
