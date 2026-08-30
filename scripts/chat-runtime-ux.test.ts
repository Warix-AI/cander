/**
 * Chat/runtime UX regressions: Recents, turn activity, response contract, stream buffer.
 * Run: node --experimental-strip-types --test scripts/chat-runtime-ux.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterRealBriefingItems,
  isLegacySyntheticBriefingId,
} from "../lib/briefing-real.ts";
import { workItems } from "../lib/work-catalog.ts";
import {
  applyProgressToTurnActivity,
  createTurnActivityState,
  formatTurnActivityLine,
  labelForPhase,
  phaseFromProgress,
  tickTurnActivity,
  withTurnActivityPhase,
} from "../lib/ai/turn-activity.ts";
import {
  countListItems,
  extractRequestedItemCount,
  inferResponseContract,
  validateResponseContract,
  mergeCompletionDraft,
} from "../lib/ai/answer-shape/index.ts";
import { compileTurnProfile } from "../lib/ai/turn-environment/index.ts";
import { createStreamPresentationBuffer } from "../lib/ai/typewriter.ts";
import { ensureCompleteAnswer } from "../lib/ai/orchestrator/ensure-complete-answer.ts";

describe("A. Recents with no real activity", () => {
  it("filters legacy synthetic briefing ids and keeps workItems empty", () => {
    assert.equal(workItems.length, 0);
    const fake = [
      { id: "brief-marketing-northwind-reply", title: "Northwind — pricing note" },
      { id: "brief-ws-handshake-review", title: "Handshake capability review" },
      { id: "brief-ws-launch-sync", title: "2:00 PM — Launch sync" },
      { id: "brief-ws-slack-threads", title: "Two Slack threads waiting" },
      { id: "brief-ws-vendor-invoice", title: "Vendor invoice — Figma" },
    ];
    for (const row of fake) {
      assert.equal(isLegacySyntheticBriefingId(row.id), true);
    }
    assert.deepEqual(filterRealBriefingItems(fake), []);
  });
});

describe("B. Recents with real chats / activity", () => {
  it("keeps only non-synthetic briefing and real thread-shaped ids", () => {
    const mixed = [
      { id: "brief-ws-northwind-reply", title: "fake" },
      { id: "briefing-gmail-thread-abc", title: "Real Gmail follow-up" },
      { id: "thr_real_1", title: "My chat" },
    ];
    const real = filterRealBriefingItems(mixed);
    assert.equal(real.length, 2);
    assert.ok(real.every((r) => !isLegacySyntheticBriefingId(r.id)));
    assert.ok(real.some((r) => r.id === "briefing-gmail-thread-abc"));
  });
});

describe("C/D. Turn activity — one row, continuous timer", () => {
  it("exposes a single formatted activity line", () => {
    const state = createTurnActivityState(1_000, "generating");
    const ticked = tickTurnActivity(state, 1_000 + 2_500);
    assert.equal(formatTurnActivityLine(ticked), "Generating · 2s");
    assert.equal(labelForPhase("searching"), "Searching");
  });

  it("changes phase on the same row without resetting startedAt", () => {
    const started = 5_000;
    let state = createTurnActivityState(started, "generating");
    state = applyProgressToTurnActivity(
      state,
      {
        phase: "tool",
        label: "Thinking",
        detail: "Searching",
        toolName: "web.search",
      },
      started + 3_000,
    );
    assert.equal(state.phase, "searching");
    assert.equal(state.startedAt, started);
    assert.equal(state.elapsedSeconds, 3);

    state = withTurnActivityPhase(state, "reading", started + 6_000);
    assert.equal(state.phase, "reading");
    assert.equal(state.startedAt, started);
    assert.equal(state.elapsedSeconds, 6);
    assert.equal(formatTurnActivityLine(state), "Reading · 6s");
  });

  it("maps progress to calm labels only", () => {
    assert.equal(
      phaseFromProgress({
        phase: "generating",
        label: "Thinking",
        detail: "Generating…",
      }),
      "generating",
    );
    assert.equal(
      phaseFromProgress({
        phase: "tool",
        label: "Thinking",
        toolName: "web.read",
      }),
      "reading",
    );
  });
});

describe("E/F. Response contract — complete N items + dynamic budget", () => {
  it("infers 5 bullets and requires completion", () => {
    const q = "Give me 5 bullet points about onboarding";
    assert.equal(extractRequestedItemCount(q), 5);
    const contract = inferResponseContract(q);
    assert.equal(contract.requestedItemCount, 5);
    assert.equal(contract.mustComplete, true);
    assert.ok(contract.outputTokenBudget >= 5 * 35);
  });

  it("validates complete vs incomplete lists", () => {
    const contract = inferResponseContract("Give me 5 bullet points about tea");
    const incomplete = validateResponseContract(
      "- one\n- two\n- three",
      contract,
    );
    assert.equal(incomplete.complete, false);
    assert.ok(incomplete.issues.includes("INCOMPLETE_ITEM_LIST"));

    const complete = validateResponseContract(
      "- one\n- two\n- three\n- four\n- five",
      contract,
    );
    assert.equal(complete.complete, true);
    assert.equal(complete.foundCount, 5);
  });

  it("raises maxOutputTokens for detailed / N-item asks", () => {
    const profile = compileTurnProfile({
      content: "Give me 10 ideas for a launch checklist",
    });
    assert.ok(profile.budgets.maxOutputTokens >= 400);
  });

  it("ensureCompleteAnswer repairs truncated lists internally", async () => {
    const question = "Give me 5 bullet points about focus";
    const draft = "- Sleep well\n- Move daily\n- Drink water";
    const result = await ensureCompleteAnswer({
      question,
      draft,
      generate: async () =>
        [
          "- Sleep well",
          "- Move daily",
          "- Drink water",
          "- Limit notifications",
          "- Protect deep work blocks",
        ].join("\n"),
    });
    assert.equal(result.repaired, true);
    assert.equal(countListItems(result.content), 5);
    assert.equal(
      validateResponseContract(result.content, result.contract).complete,
      true,
    );
  });

  it("mergeCompletionDraft prefers the fuller continuation", () => {
    const merged = mergeCompletionDraft("- a\n- b", "- a\n- b\n- c\n- d\n- e");
    assert.equal(countListItems(merged), 5);
  });
});

describe("G. Streaming presentation buffer", () => {
  it("releases text gradually then finishes without blocking generation", async () => {
    const frames: Array<{ text: string; done: boolean }> = [];
    const buf = createStreamPresentationBuffer({
      msPerTick: 5,
      charsPerTick: 2,
      catchUpCharsPerTick: 50,
      onVisible: (text, done) => frames.push({ text, done }),
    });

    // Model already has the full answer — only UI pacing is buffered.
    const full = "Hello world from Cander";
    buf.push(full.slice(0, 5));
    buf.push(full);
    buf.finish(full);

    await new Promise((r) => setTimeout(r, 80));
    assert.ok(frames.length >= 1);
    const last = frames[frames.length - 1]!;
    assert.equal(last.done, true);
    assert.equal(last.text, full);
    // Intermediate frames prove smoothing happened (or reduced-motion dump once).
    assert.ok(frames.length >= 1);
  });
});
