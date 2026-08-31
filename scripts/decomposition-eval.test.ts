/**
 * Decomposition golden-set eval — Phase 0 harness (zero network).
 * Runs request scanner, turn relation, and research plan compiler against labeled cases.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { scanRequest } from "../lib/ai/orchestrator/request-scanner.ts";
import { compileTaskGraph } from "../lib/ai/orchestrator/task-graph.ts";
import {
  classifyTurnRelation,
  compileResearchTurnPlan,
  compileTurnProfile,
  compileWebRetrievalPlan,
  emptyConversationTurnState,
  resolveTurnTask,
} from "../lib/ai/turn-environment/index.ts";
import type { DecompositionGoldenCatalog } from "./fixtures/decomposition-golden/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(
  __dirname,
  "fixtures/decomposition-golden/catalog.json",
);

function loadCatalog(): DecompositionGoldenCatalog {
  return JSON.parse(
    fs.readFileSync(CATALOG_PATH, "utf8"),
  ) as DecompositionGoldenCatalog;
}

function seedState(
  seed?: DecompositionGoldenCatalog["cases"][0]["seedState"],
) {
  if (!seed) return emptyConversationTurnState();
  return { ...emptyConversationTurnState(), ...seed };
}

describe("decomposition golden set", () => {
  const catalog = loadCatalog();

  for (const c of catalog.cases) {
    it(`${c.id}: ${c.category}`, () => {
      const conv = seedState(c.seedState);
      const ledger = scanRequest(c.prompt);

      if (c.expect.minAsks != null) {
        assert.ok(
          ledger.asks.length >= c.expect.minAsks,
          `${c.id}: expected >= ${c.expect.minAsks} asks, got ${ledger.asks.length}`,
        );
      }
      if (c.expect.minConstraints != null) {
        assert.ok(
          ledger.constraints.length >= c.expect.minConstraints,
          `${c.id}: expected >= ${c.expect.minConstraints} constraints`,
        );
      }
      if (c.expect.askExtractorTriggers?.length) {
        for (const trigger of c.expect.askExtractorTriggers) {
          assert.ok(
            ledger.askExtractorTriggers.includes(trigger),
            `${c.id}: missing trigger ${trigger}`,
          );
        }
      }

      const relation = classifyTurnRelation({
        userMessage: c.prompt,
        previous: conv,
      });
      if (c.expect.turnRelation) {
        assert.equal(relation.relation, c.expect.turnRelation, c.id);
      }

      const turnTask = resolveTurnTask({
        content: c.prompt,
        previous: conv,
        turnRelation: relation.relation,
      });

      const webPlan = compileWebRetrievalPlan({
        content: c.prompt,
        turnTask,
        conv,
        turnRelation: relation.relation,
      });
      if (c.expect.queryMustNotInclude?.length) {
        for (const bad of c.expect.queryMustNotInclude) {
          assert.ok(
            !new RegExp(bad, "i").test(webPlan.query),
            `${c.id}: query must not include ${bad}`,
          );
        }
      }

      const researchPlan = compileResearchTurnPlan({
        content: c.prompt,
        turnTask,
      });

      if (c.expect.researchObjective === null) {
        assert.equal(researchPlan, null, `${c.id}: unexpected research plan`);
      } else if (c.expect.researchObjective) {
        assert.ok(researchPlan, `${c.id}: expected research plan`);
        assert.equal(
          researchPlan!.objective,
          c.expect.researchObjective,
          c.id,
        );
      }
      if (c.expect.subtaskCount != null) {
        assert.ok(researchPlan, `${c.id}: missing research plan for subtasks`);
        assert.equal(
          researchPlan!.subtasks.length,
          c.expect.subtaskCount,
          c.id,
        );
      }
      if (c.expect.subtaskQueryIncludes?.length) {
        assert.ok(researchPlan, `${c.id}: missing research plan`);
        for (const fragment of c.expect.subtaskQueryIncludes) {
          assert.ok(
            researchPlan!.subtasks.some((s) =>
              new RegExp(fragment, "i").test(s.query),
            ),
            `${c.id}: no subtask query matching ${fragment}`,
          );
        }
      }

      if (
        c.expect.retrieveNodeCount != null ||
        c.expect.retrieveQueriesAtomic
      ) {
        const graph = compileTaskGraph({ ledger, researchPlan, turnTask });
        const retrieveNodes = graph.nodes.filter((n) => n.kind === "RETRIEVE");
        if (c.expect.retrieveNodeCount != null) {
          assert.equal(
            retrieveNodes.length,
            c.expect.retrieveNodeCount,
            `${c.id}: retrieve node count`,
          );
        }
        if (c.expect.retrieveQueriesAtomic) {
          assert.ok(
            retrieveNodes.every(
              (n) => n.query && n.query.length < c.prompt.length,
            ),
            `${c.id}: retrieve queries must be atomic`,
          );
        }
      }

      // Compile path smoke — ensures research plan wires into pre-run
      const profile = compileTurnProfile({
        content: c.prompt,
        conversationState: { ...conv, lastTurnRelation: relation.relation },
        turnRelation: relation.relation,
      });
      if (c.expect.subtaskCount != null && c.expect.subtaskCount >= 2) {
        const subSearches = profile.preRunTasks.filter(
          (t) => t.name === "web.search" && t.subtaskId,
        );
        assert.equal(
          subSearches.length,
          c.expect.subtaskCount,
          `${c.id}: pre-run subtask searches`,
        );
      }
    });
  }

  it(`catalog has at least ${Math.min(8, catalog.cases.length)} seed cases`, () => {
    assert.ok(catalog.cases.length >= 8);
  });
});

describe("decomposition golden — stateful chain", () => {
  it("food calories then sports question switches topic in chain", () => {
    const state = {
      ...emptyConversationTurnState(),
      entities: [
        {
          id: "f1",
          type: "food" as const,
          label: "In-N-Out double double",
          contextClass: "ACTIVE" as const,
        },
      ],
      constraints: { attribute: "calories" },
    };

    const sports = "When will Utah Utes and BYU football face off this year?";
    const rel = classifyTurnRelation({ userMessage: sports, previous: state });
    assert.equal(rel.relation, "topic_switch");

    const webPlan = compileWebRetrievalPlan({
      content: sports,
      turnTask: resolveTurnTask({
        content: sports,
        previous: state,
        turnRelation: rel.relation,
      }),
      conv: state,
      turnRelation: rel.relation,
    });
    assert.ok(!/in-n-out|calorie|nutrition/i.test(webPlan.query));
  });
});
