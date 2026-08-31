/**
 * Conversation trajectory eval — chained state + route + answer contracts.
 * Zero network; semantic path uses injectable heuristic/mock.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyConversationDelta,
  applyConversationEmit,
  compileTurnProfile,
  emptyConversationTurnState,
  resetConvIdSeq,
  resolveConversationDelta,
  type ConversationTurnState,
  type EntityRef,
} from "../lib/ai/turn-environment/index.ts";
import type {
  TrajectoryExpect,
  TrajectoryFixture,
  TrajectoryTurn,
} from "./fixtures/trajectories/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX_ROOT = path.join(__dirname, "fixtures/trajectories");

function loadFixtures(): TrajectoryFixture[] {
  const out: TrajectoryFixture[] = [];
  if (!fs.existsSync(FIX_ROOT)) return out;
  for (const dir of fs.readdirSync(FIX_ROOT)) {
    const full = path.join(FIX_ROOT, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const file of fs.readdirSync(full)) {
      if (!file.endsWith(".json")) continue;
      const raw = JSON.parse(
        fs.readFileSync(path.join(full, file), "utf8"),
      ) as TrajectoryFixture;
      out.push(raw);
    }
  }
  return out;
}

function activeLabels(state: ConversationTurnState): string[] {
  return state.entities
    .filter((e) => e.contextClass === "ACTIVE")
    .map((e) => e.label);
}

function assertExpect(
  fixId: string,
  turnIdx: number,
  state: ConversationTurnState,
  expect: TrajectoryExpect,
  content: string,
) {
  const label = `${fixId}#${turnIdx}`;
  if (expect.activeEntityLabels) {
    const got = activeLabels(state);
    for (const want of expect.activeEntityLabels) {
      assert.ok(
        got.some((g) => g.toLowerCase() === want.toLowerCase()),
        `${label}: expected active entity ${want}, got ${got.join(",")}`,
      );
    }
  }
  if (expect.constraints) {
    for (const [k, v] of Object.entries(expect.constraints)) {
      assert.equal(
        state.constraints[k],
        v,
        `${label}: constraint ${k}`,
      );
    }
  }
  if (expect.exclusions) {
    for (const ex of expect.exclusions) {
      assert.ok(
        state.exclusions.some((e) => e.toLowerCase().includes(ex.toLowerCase())),
        `${label}: exclusion ${ex}`,
      );
    }
  }
  if (expect.freshnessRequirement != null) {
    assert.equal(
      state.freshnessRequirement,
      expect.freshnessRequirement,
      `${label}: freshness`,
    );
  }
  if (expect.dissatisfactionSignal != null) {
    assert.equal(
      state.dissatisfactionSignal,
      expect.dissatisfactionSignal,
      `${label}: dissatisfaction`,
    );
  }
  if (expect.clarificationRequired != null) {
    assert.equal(
      state.clarificationRequired,
      expect.clarificationRequired,
      `${label}: clarificationRequired`,
    );
  }
  if (expect.externalRetrievalRequired != null) {
    assert.equal(
      state.externalRetrievalRequired,
      expect.externalRetrievalRequired,
      `${label}: externalRetrieval`,
    );
  }
  if (expect.internalDataRequired != null) {
    assert.equal(
      state.internalDataRequired,
      expect.internalDataRequired,
      `${label}: internalData`,
    );
  }
  if (expect.desiredAnswerShape) {
    assert.equal(
      state.desiredAnswerShape,
      expect.desiredAnswerShape,
      `${label}: answerShape`,
    );
  }
  if (expect.currentOperation) {
    assert.equal(
      state.currentOperation,
      expect.currentOperation,
      `${label}: operation`,
    );
  }
  if (expect.presentation) {
    assert.equal(
      state.presentation,
      expect.presentation,
      `${label}: presentation`,
    );
  }
  if (expect.requestedFields?.length) {
    for (const f of expect.requestedFields) {
      assert.ok(
        state.requestedFields.includes(f),
        `${label}: requested field ${f}, got ${state.requestedFields.join(",")}`,
      );
    }
  }
  if (expect.referencedItemLabel) {
    const hit = state.entities.some(
      (e) =>
        e.contextClass === "ACTIVE" &&
        e.label.toLowerCase() === expect.referencedItemLabel!.toLowerCase(),
    );
    assert.ok(hit, `${label}: referenced ${expect.referencedItemLabel}`);
  }

  const profile = compileTurnProfile({
    content,
    conversationState: state,
  });

  if (expect.route?.toolMode) {
    assert.equal(profile.toolMode, expect.route.toolMode, `${label}: toolMode`);
  }
  if (expect.route?.preRunIncludes?.length) {
    for (const name of expect.route.preRunIncludes) {
      assert.ok(
        profile.preRunTasks.some((t) => t.name === name),
        `${label}: preRun missing ${name}`,
      );
    }
  }
  if (expect.route?.minOutputTokens != null) {
    assert.ok(
      profile.budgets.maxOutputTokens >= expect.route.minOutputTokens,
      `${label}: maxOutputTokens ${profile.budgets.maxOutputTokens} < ${expect.route.minOutputTokens}`,
    );
  }
  if (expect.route?.unnecessaryClarify === false) {
    assert.equal(
      profile.clarificationPolicy.clarificationRequired,
      false,
      `${label}: unnecessary clarify`,
    );
  }

  const ac = expect.answerContract;
  if (ac?.mustNotAskClarification) {
    assert.equal(
      state.clarificationRequired,
      false,
      `${label}: mustNotAskClarification`,
    );
    assert.equal(
      profile.clarificationPolicy.clarificationRequired,
      false,
      `${label}: profile mustNotAskClarification`,
    );
  }
  if (ac?.mustAnswerDirectly) {
    assert.equal(
      profile.clarificationPolicy.clarificationRequired,
      false,
      `${label}: mustAnswerDirectly`,
    );
  }
  if (ac?.mustUseFreshEvidence) {
    assert.ok(
      state.freshnessRequirement ||
        state.externalRetrievalRequired ||
        profile.preRunTasks.some((t) => t.name === "web.search"),
      `${label}: mustUseFreshEvidence`,
    );
  }
  if (ac?.mustNotRepeatPreviousAnswer) {
    assert.ok(
      state.dissatisfactionSignal ||
        state.freshnessRequirement ||
        state.externalRetrievalRequired ||
        state.currentOperation === "list" ||
        state.currentOperation === "add_fields" ||
        state.currentOperation === "deepen" ||
        state.currentOperation === "compare" ||
        state.currentOperation === "reformat",
      `${label}: mustNotRepeatPreviousAnswer (operation=${state.currentOperation})`,
    );
  }
}

describe("conversation trajectory suite", () => {
  const fixtures = loadFixtures();

  it("has at least 100 fixtures", () => {
    assert.ok(
      fixtures.length >= 100,
      `expected ≥100 fixtures, got ${fixtures.length}`,
    );
  });

  for (const fix of fixtures) {
    it(`trajectory ${fix.id}`, async () => {
      resetConvIdSeq();
      let state = emptyConversationTurnState();
      if (fix.seedState) {
        state = { ...state, ...fix.seedState } as ConversationTurnState;
      }

      let turnIdx = 0;
      for (const turn of fix.turns as TrajectoryTurn[]) {
        turnIdx += 1;
        if (turn.role === "assistant") {
          if (turn.emit) {
            state = applyConversationEmit(state, turn.emit);
          }
          continue;
        }

        const candidates = turn.candidates?.entities as EntityRef[] | undefined;
        const delta = await resolveConversationDelta({
          previous: state,
          userMessage: turn.content,
          candidates: candidates ? { entities: candidates } : undefined,
        });
        state = applyConversationDelta(state, delta);

        if (turn.expect) {
          assertExpect(fix.id, turnIdx, state, turn.expect, turn.content);
        }
      }
    });
  }
});
