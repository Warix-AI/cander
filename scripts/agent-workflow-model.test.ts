/**
 * Lightweight checks for progressive workflow mapping.
 * Run: npx tsx scripts/agent-workflow-model.test.ts
 */

import assert from "node:assert/strict";
import type { AgentRoute } from "../lib/agents/types";
import {
  deleteStep,
  emptyTriggerRoute,
  insertStep,
  routesToSteps,
} from "../components/agents/builder/workflow-model";

function sampleRoute(partial?: Partial<AgentRoute>): AgentRoute {
  return {
    id: "art_1",
    agentId: "agt_1",
    name: "Workflow",
    enabled: true,
    sortOrder: 0,
    trigger: {
      type: "manual",
      label: "WHEN something happens",
      config: {},
    },
    condition: {
      type: "always",
      expression: "IF always",
      config: {},
    },
    actions: [{ type: "notify", label: "DO an action", config: {} }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

function main() {
  assert.equal(routesToSteps([]).length, 0);

  const legacy = sampleRoute();
  const legacySteps = routesToSteps([legacy]);
  assert.equal(legacySteps[0]?.type, "trigger");
  assert.equal(legacySteps[0]?.status, "incomplete");
  assert.ok(!legacySteps.some((s) => s.type === "condition"));
  assert.equal(legacySteps.some((s) => s.type === "action"), true);

  const seeded = emptyTriggerRoute();
  assert.equal(seeded.trigger?.config?.incomplete, true);
  assert.equal(seeded.condition?.config?.skipped, true);
  assert.deepEqual(seeded.actions, []);

  const afterInsert = insertStep([], { kind: "after-agent" }, "trigger");
  assert.equal(afterInsert.upsertRoutes.length, 1);

  const withTrigger: AgentRoute = sampleRoute({
    trigger: {
      type: "manual",
      label: "Choose a trigger…",
      config: { incomplete: true },
    },
    condition: {
      type: "always",
      expression: "always",
      config: { skipped: true },
    },
    actions: [],
  });
  const steps = routesToSteps([withTrigger]);
  assert.equal(steps.length, 1);
  assert.equal(steps[0]?.type, "trigger");

  const withAction = insertStep(
    [withTrigger],
    { kind: "after-step", stepId: `${withTrigger.id}:trigger` },
    "action",
  );
  assert.equal(withAction.upsertRoutes[0]?.actions?.length, 1);

  const deleted = deleteStep(
    [
      {
        ...withTrigger,
        actions: [
          {
            type: "action",
            label: "Choose an action…",
            config: { incomplete: true },
          },
        ],
      },
    ],
    `${withTrigger.id}:action:0`,
  );
  assert.deepEqual(deleted.deleteRouteIds, [withTrigger.id]);

  console.log("agent-workflow-model.test.ts: ok");
}

main();
