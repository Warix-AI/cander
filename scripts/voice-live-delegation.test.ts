import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildVoiceDelegationMessages,
  resolveDelegationRequest,
  summarizeForVoiceSpeech,
} from "../lib/voice/live-delegation.ts";
import {
  isLiveVoiceId,
  LIVE_VOICE_OPTIONS,
  liveVoicePersonaName,
} from "../lib/voice/live-voices.ts";
import {
  createVoiceDelegationNarrator,
  openingLineForDelegation,
  spokenLineFromProgress,
} from "../lib/voice/voice-delegation-progress.ts";

const realtimeToolsSrc = readFileSync(
  fileURLToPath(new URL("../lib/voice/realtime-tools.ts", import.meta.url)),
  "utf8",
);

describe("GPT-Live voice helpers", () => {
  it("uses gpt-live-1 as the conversation model", () => {
    assert.match(realtimeToolsSrc, /gpt-live-1/);
  });

  it("resolves the latest user utterance for delegation", () => {
    const request = resolveDelegationRequest([
      { role: "user", text: "Hello", at: 1 },
      { role: "assistant", text: "Hi there.", at: 2 },
      { role: "user", text: "Search BYU's next football game.", at: 3 },
    ]);
    assert.equal(request, "Search BYU's next football game.");
  });

  it("keeps recent transcript context for follow-ups", () => {
    const messages = buildVoiceDelegationMessages([
      { role: "user", text: "Who is BYU playing next?", at: 1 },
      { role: "assistant", text: "They're playing Utah next Saturday.", at: 2 },
      { role: "user", text: "What time is that?", at: 3 },
    ]);
    assert.equal(messages.length, 3);
    assert.equal(messages[2]?.content, "What time is that?");
  });

  it("compresses long assistant answers for speech", () => {
    const spoken = summarizeForVoiceSpeech(
      "One. Two. Three. Four. Five should be dropped after the fourth sentence.",
    );
    assert.match(spoken, /One/);
    assert.match(spoken, /Four/);
    assert.doesNotMatch(spoken, /Five should/);
  });

  it("validates live voice ids and persona labels", () => {
    assert.equal(isLiveVoiceId("marin"), true);
    assert.equal(isLiveVoiceId("gleam"), true);
    assert.equal(isLiveVoiceId("quartz"), true);
    assert.equal(isLiveVoiceId("delta"), true);
    assert.equal(isLiveVoiceId("alloy"), false);
    assert.ok(LIVE_VOICE_OPTIONS.length >= 12);
    assert.ok(LIVE_VOICE_OPTIONS.some((v) => v.id === "marin"));
    assert.ok(LIVE_VOICE_OPTIONS.some((v) => v.id === "gleam"));
    assert.equal(liveVoicePersonaName("gleam"), "Grace");
    assert.equal(liveVoicePersonaName("quartz"), "Quinn");
  });

  it("maps live voice ids to persona names for instructions", () => {
    assert.equal(liveVoicePersonaName("gleam"), "Grace");
    assert.match(realtimeToolsSrc, /Your conversational name is/);
    assert.match(realtimeToolsSrc, /answer with your persona name|spoken name|conversational name/i);
  });

  it("requires Live to delegate document / looking-at asks", () => {
    assert.match(realtimeToolsSrc, /what they are looking at/);
    assert.match(realtimeToolsSrc, /this document/);
    assert.match(realtimeToolsSrc, /only see a title/);
    assert.match(realtimeToolsSrc, /ConnectorFocus/);
    assert.match(realtimeToolsSrc, /gdocs\.get/);
  });

  it("instructs Live to speak mid-delegation progress commentary", () => {
    assert.match(realtimeToolsSrc, /Progress commentary during delegation/);
    assert.match(realtimeToolsSrc, /mid-delegation commentary/);
    assert.match(realtimeToolsSrc, /do not stay silent/i);
  });
});

describe("voice delegation progress narrator", () => {
  it("opens with focused title or Stripe/search cues", () => {
    assert.match(
      openingLineForDelegation({
        requestText: "summarize this",
        focusedTitle: "Q3 invoice draft",
      }),
      /Q3 invoice draft/,
    );
    assert.match(
      openingLineForDelegation({
        requestText: "check stripe payments",
      }),
      /Stripe/,
    );
    assert.match(
      openingLineForDelegation({
        requestText: "search the latest score",
      }),
      /search/i,
    );
  });

  it("maps tool progress into spoken lines", () => {
    assert.equal(
      spokenLineFromProgress({
        phase: "tool",
        label: "Running",
        toolName: "stripe.list_customers",
      }),
      "Looking at Stripe…",
    );
    assert.equal(
      spokenLineFromProgress({
        phase: "tool",
        label: "Running",
        toolName: "web.search",
      }),
      "Searching the web…",
    );
    assert.equal(
      spokenLineFromProgress({
        phase: "thinking",
        label: "Thinking",
      }),
      null,
    );
  });

  it("throttles duplicate progress and only heartbeats after long silence", () => {
    const spoken: string[] = [];
    let t = 0;
    const narrator = createVoiceDelegationNarrator({
      sendCommentary: (line) => spoken.push(line),
      now: () => t,
      minIntervalMs: 1000,
      heartbeatMs: 7_000,
      maxSpoken: 6,
    });

    try {
      narrator.open({ requestText: "check my email" });
      assert.equal(spoken.length, 1);
      assert.match(spoken[0]!, /email/i);

      narrator.fromProgress({
        phase: "tool",
        label: "Running",
        toolName: "gmail.list",
      });
      assert.equal(spoken.length, 1); // throttled (t still 0)

      t = 3_000;
      narrator.fromProgress({
        phase: "tool",
        label: "Running",
        toolName: "gmail.list",
      });
      assert.equal(spoken.length, 2);
      assert.match(spoken[1]!, /email/i);

      // Under 5–8s silence should not yet say a hang-tight heartbeat.
      assert.doesNotMatch(spoken.join(" "), /hang tight|Still working/i);

      narrator.finish();
      t = 20_000;
      narrator.say("Should not speak");
      assert.equal(spoken.length, 2);
    } finally {
      narrator.finish();
    }
  });
});
