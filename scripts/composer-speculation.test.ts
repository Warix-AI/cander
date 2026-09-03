/**
 * Composer speculation — fingerprint, cache, session take, flag.
 * Run: node --experimental-strip-types --test scripts/composer-speculation.test.ts
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { isComposerSpeculationEnabled } from "../lib/ai/composer-speculation/flags.ts";
import {
  normalizeSpeculationText,
  shouldEvaluateSpeculation,
  speculationFingerprint,
  speculationWordCount,
} from "../lib/ai/composer-speculation/fingerprint.ts";
import {
  allowSpecDraft,
  clearSpeculationCacheForTests,
  getSpecDraft,
  getSpecWarm,
  putSpecDraft,
  putSpecWarm,
} from "../lib/ai/composer-speculation/server-cache.ts";
import {
  clearComposerSpeculationSnapshot,
  getComposerSpeculationSnapshot,
  setComposerSpeculationSnapshot,
  takeComposerSpeculationForSend,
} from "../lib/ai/composer-speculation/session-store.ts";

describe("composer speculation flag", () => {
  it("defaults off (prediction parked)", () => {
    const prev = process.env.NEXT_PUBLIC_COMPOSER_SPECULATION;
    delete process.env.NEXT_PUBLIC_COMPOSER_SPECULATION;
    assert.equal(isComposerSpeculationEnabled(), false);
    if (prev !== undefined) process.env.NEXT_PUBLIC_COMPOSER_SPECULATION = prev;
  });

  it("can be enabled via env when we turn it back on", () => {
    const prev = process.env.NEXT_PUBLIC_COMPOSER_SPECULATION;
    process.env.NEXT_PUBLIC_COMPOSER_SPECULATION = "1";
    assert.equal(isComposerSpeculationEnabled(), true);
    process.env.NEXT_PUBLIC_COMPOSER_SPECULATION = "0";
    assert.equal(isComposerSpeculationEnabled(), false);
    if (prev !== undefined) process.env.NEXT_PUBLIC_COMPOSER_SPECULATION = prev;
    else delete process.env.NEXT_PUBLIC_COMPOSER_SPECULATION;
  });
});

describe("fingerprint + triggers", () => {
  it("counts words and gates evaluation", () => {
    assert.equal(speculationWordCount("one two three four"), 4);
    assert.equal(shouldEvaluateSpeculation("one two three four"), false);
    assert.equal(
      shouldEvaluateSpeculation("one two three four five"),
      true,
    );
    assert.equal(shouldEvaluateSpeculation("Yes it is."), true);
  });

  it("matches Send fingerprint without thread id", () => {
    const text = "What is two plus two?";
    const a = speculationFingerprint(text, {
      workspaceId: "w1",
      threadId: null,
      attachmentCount: 0,
    });
    const b = speculationFingerprint(text, {
      workspaceId: "w1",
      threadId: "t_new",
      attachmentCount: 0,
    });
    assert.equal(a, b);
    assert.equal(normalizeSpeculationText("  a   b  "), "a b");
  });
});

describe("server cache", () => {
  beforeEach(() => clearSpeculationCacheForTests());

  it("stores and retrieves warm + draft", () => {
    putSpecWarm({
      warmHandle: "wh1",
      userId: "u1",
      threadId: null,
      workspaceId: "w",
      inputFingerprint: "fp1",
      route: "LOCAL",
      textNorm: "hello there friend please",
    });
    assert.equal(getSpecWarm("wh1")?.route, "LOCAL");
    putSpecDraft({
      warmHandle: "wh1",
      userId: "u1",
      inputFingerprint: "fp1",
      draftText: "Hi!",
      model: "test",
    });
    assert.equal(getSpecDraft("wh1", "fp1")?.draftText, "Hi!");
  });

  it("rate limits drafts", () => {
    for (let i = 0; i < 8; i++) assert.equal(allowSpecDraft("u"), true);
    assert.equal(allowSpecDraft("u"), false);
  });
});

describe("session take on Send", () => {
  beforeEach(() => clearComposerSpeculationSnapshot());

  it("reuses matching draft and clears snapshot", async () => {
    setComposerSpeculationSnapshot({
      speculateId: "s1",
      gen: 1,
      warmHandle: "wh",
      inputFingerprint: "fp_match",
      route: "LOCAL",
      textNorm: "what is two plus two",
      draftText: "4",
      tier: 2,
      updatedAt: Date.now(),
    });
    const taken = await takeComposerSpeculationForSend({
      text: "what is two plus two",
      fingerprint: "fp_match",
    });
    assert.equal(taken?.draftText, "4");
    assert.equal(getComposerSpeculationSnapshot(), null);
  });

  it("discards on fingerprint divergence", async () => {
    setComposerSpeculationSnapshot({
      speculateId: "s1",
      gen: 1,
      warmHandle: "wh",
      inputFingerprint: "fp_old",
      route: "LOCAL",
      textNorm: "old",
      draftText: "nope",
      tier: 2,
      updatedAt: Date.now(),
    });
    const taken = await takeComposerSpeculationForSend({
      text: "new text here now",
      fingerprint: "fp_new",
      waitMs: 50,
    });
    assert.equal(taken, null);
    assert.equal(getComposerSpeculationSnapshot(), null);
  });

  it("awaits pending draft with matching fingerprint", async () => {
    const { setPendingSpeculationDraft } = await import(
      "../lib/ai/composer-speculation/session-store.ts"
    );
    setPendingSpeculationDraft({
      fingerprint: "fp_pend",
      promise: new Promise((resolve) => {
        setTimeout(
          () =>
            resolve({
              speculateId: "s",
              gen: 2,
              warmHandle: "wh",
              inputFingerprint: "fp_pend",
              route: "UNCERTAIN",
              textNorm: "what is photosynthesis about",
              draftText: "Photosynthesis converts light to energy.",
              tier: 2,
              updatedAt: Date.now(),
            }),
          30,
        );
      }),
    });
    const taken = await takeComposerSpeculationForSend({
      text: "what is photosynthesis about",
      fingerprint: "fp_pend",
      waitMs: 2000,
    });
    assert.equal(
      taken?.draftText,
      "Photosynthesis converts light to energy.",
    );
  });
});
