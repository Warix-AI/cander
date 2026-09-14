import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildVoiceDelegationMessages,
  resolveDelegationRequest,
  summarizeForVoiceSpeech,
} from "../lib/voice/live-delegation.ts";
import {
  isLiveVoiceId,
  LIVE_VOICE_OPTIONS,
} from "../lib/voice/live-voices.ts";
import { REALTIME_CONVERSATION_MODEL } from "../lib/voice/realtime-tools.ts";

describe("GPT-Live voice helpers", () => {
  it("uses gpt-live-1 as the conversation model", () => {
    assert.equal(REALTIME_CONVERSATION_MODEL, "gpt-live-1");
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
      "First sentence is enough. Second sentence adds a bit more. Third should be dropped.",
    );
    assert.match(spoken, /First sentence/);
    assert.match(spoken, /Second sentence/);
    assert.doesNotMatch(spoken, /Third should/);
  });

  it("validates live voice ids", () => {
    assert.equal(isLiveVoiceId("marin"), true);
    assert.equal(isLiveVoiceId("gleam"), true);
    assert.equal(isLiveVoiceId("alloy"), false);
    assert.ok(LIVE_VOICE_OPTIONS.length >= 5);
  });
});
