import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  clampAssistantProfile,
  DEFAULT_ASSISTANT_PROFILE,
  getAssistantProfileSnapshot,
  mergeAssistantProfiles,
  patchAssistantProfile,
  replaceAssistantProfile,
  resetAssistantProfile,
  resolveAssistantDisplayName,
  undoAssistantProfile,
  buildAssistantIdentityInstructions,
} from "../lib/voice/assistant-profile.ts";
import {
  buildLivePersonalityInstructions,
} from "../lib/voice/realtime-tools.ts";
import {
  LIVE_IDLE_TIMEOUT_MS,
  isLiveSessionBusyForIdle,
} from "../lib/voice/live-idle.ts";
import {
  VOICE_SUGGESTION_CATEGORIES,
  pickSuggestionExample,
  voiceSettingsGridClass,
} from "../lib/voice/voice-suggestion-catalog.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("AssistantProfile store", () => {
  beforeEach(() => {
    replaceAssistantProfile(
      {
        ...DEFAULT_ASSISTANT_PROFILE,
        voiceNames: {},
        customStyleInstructions: [],
      },
      { pushUndo: false },
    );
  });

  it("clamps continuous dimensions to 1–10", () => {
    const clamped = clampAssistantProfile({ humor: 99, pace: -3, energy: 5.55 });
    assert.equal(clamped.humor, 10);
    assert.equal(clamped.pace, 1);
    assert.equal(clamped.energy, 6);
  });

  it("patches, undoes, and resets", () => {
    patchAssistantProfile({ humor: 9, assistantName: "Alfred" });
    const mid = getAssistantProfileSnapshot();
    assert.equal(mid.humor, 9);
    assert.equal(mid.assistantName, "Alfred");

    const undone = undoAssistantProfile();
    assert.ok(undone);
    assert.equal(undone!.humor, DEFAULT_ASSISTANT_PROFILE.humor);
    assert.equal(undone!.assistantName, null);

    patchAssistantProfile({ pace: 2 });
    resetAssistantProfile();
    const reset = getAssistantProfileSnapshot();
    assert.equal(reset.pace, DEFAULT_ASSISTANT_PROFILE.pace);
    assert.equal(reset.humor, DEFAULT_ASSISTANT_PROFILE.humor);
  });

  it("keeps custom name on the voice it was set for", () => {
    patchAssistantProfile({ assistantName: "Alfred", voiceId: "marin" });
    assert.equal(
      resolveAssistantDisplayName(getAssistantProfileSnapshot()),
      "Alfred",
    );
    patchAssistantProfile({ voiceId: "gleam" });
    const next = getAssistantProfileSnapshot();
    assert.equal(next.voiceNames?.marin, "Alfred");
    assert.equal(resolveAssistantDisplayName(next), "Grace");
  });

  it("persists the user's preferred name", () => {
    patchAssistantProfile({ userName: "Matt" });
    assert.equal(getAssistantProfileSnapshot().userName, "Matt");
    const identity = buildAssistantIdentityInstructions(
      getAssistantProfileSnapshot(),
    );
    assert.match(identity, /Matt/);
    assert.match(identity, /Alfred|Charlie|conversational name/i);
  });

  it("merge prefers local identity over null remote fields", () => {
    const remote = clampAssistantProfile({
      voiceId: "vesper",
      assistantName: null,
      userName: null,
    });
    const local = clampAssistantProfile({
      voiceId: "marin",
      assistantName: "Jarvis",
      userName: "Sam",
    });
    const merged = mergeAssistantProfiles(remote, local);
    assert.equal(merged.assistantName, "Jarvis");
    assert.equal(merged.userName, "Sam");
    assert.equal(merged.voiceId, "vesper");
  });
});

describe("buildLivePersonalityInstructions", () => {
  it("uses natural prose for style and a numeric ledger for ask/report", () => {
    const profile = clampAssistantProfile({
      assistantName: "Jarvis",
      humor: 9,
      pace: 2,
      energy: 8,
    });
    const text = buildLivePersonalityInstructions(profile);
    assert.match(text, /Jarvis/);
    assert.match(text, /humor|joke/i);
    assert.match(text, /pace|relaxed|unhurried|brisk/i);
    assert.doesNotMatch(text, /humor\s*=\s*9/);
    assert.doesNotMatch(text, /\bpace=2\b/);
    assert.match(text, /Current settings \(1–10 scale\).*humor 9/);
    assert.match(text, /My humor setting is at/);
  });
});

describe("voice suggestion catalog", () => {
  it("includes all 10 categories with approved examples", () => {
    assert.equal(VOICE_SUGGESTION_CATEGORIES.length, 10);
    const ids = VOICE_SUGGESTION_CATEGORIES.map((c) => c.id);
    for (const id of [
      "humor",
      "sarcasm",
      "pace",
      "energy",
      "personality",
      "tone",
      "length",
      "voice",
      "name",
      "expressiveness",
    ]) {
      assert.ok(ids.includes(id as (typeof ids)[number]), id);
    }
    for (const cat of VOICE_SUGGESTION_CATEGORIES) {
      assert.ok(cat.examples.length >= 6);
      for (const ex of cat.examples) {
        assert.ok(ex.trim().length > 0);
      }
    }
  });

  it("rotates examples stably per seed", () => {
    const humor = VOICE_SUGGESTION_CATEGORIES.find((c) => c.id === "humor")!;
    const a = pickSuggestionExample(humor, 7);
    const b = pickSuggestionExample(humor, 7);
    const c = pickSuggestionExample(humor, 8);
    assert.equal(a, b);
    assert.ok(humor.examples.includes(a));
    assert.ok(humor.examples.includes(c));
  });

  it("uses 1-col mobile and 2-col desktop grid classes", () => {
    assert.match(voiceSettingsGridClass(true), /grid-cols-1/);
    assert.doesNotMatch(voiceSettingsGridClass(true), /sm:grid-cols-2/);
    assert.match(voiceSettingsGridClass(false), /sm:grid-cols-2/);
  });
});

describe("Voice Settings cards stay conversational", () => {
  it("suggestion cards send phrases; voice picker may write voice id", () => {
    const src = readFileSync(
      fileURLToPath(
        new URL("../components/settings/VoiceSettings.tsx", import.meta.url),
      ),
      "utf8",
    );
    assert.doesNotMatch(src, /patchAssistantProfile/);
    assert.match(src, /sendMessage/);
    assert.match(src, /writeLiveVoicePreference|renameVoice/);
    assert.match(src, /LIVE_VOICE_OPTIONS/);
    assert.match(src, /voiceSettingsGridClass/);
  });
});

describe("Live idle + voice rollover wiring", () => {
  it("exports a 60s idle window and busy-state helper", () => {
    assert.equal(LIVE_IDLE_TIMEOUT_MS, 60_000);
    assert.equal(
      isLiveSessionBusyForIdle({
        speaking: false,
        status: "listening",
        inFlightDelegations: 0,
      }),
      false,
    );
    assert.equal(
      isLiveSessionBusyForIdle({
        speaking: true,
        status: "listening",
        inFlightDelegations: 0,
      }),
      true,
    );
    assert.equal(
      isLiveSessionBusyForIdle({
        speaking: false,
        status: "thinking",
        inFlightDelegations: 0,
      }),
      true,
    );
    assert.equal(
      isLiveSessionBusyForIdle({
        speaking: false,
        status: "listening",
        inFlightDelegations: 1,
      }),
      true,
    );
  });

  it("AppProvider rolls over Live on voiceId change", () => {
    const src = readFileSync(
      fileURLToPath(
        new URL("../components/app/AppProvider.tsx", import.meta.url),
      ),
      "utf8",
    );
    assert.match(src, /subscribeAssistantProfile/);
    assert.match(src, /voiceRollingRef/);
    assert.match(src, /appendPersonalityInstructions/);
    assert.match(src, /Voice ended due to inactivity/);
    assert.match(src, /onIdleTimeout/);
  });

  it("token route accepts profile snapshots", () => {
    const src = readFileSync(
      fileURLToPath(
        new URL(
          "../app/api/ai/raw-openai/realtime-conversation-token/route.ts",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    assert.match(src, /clampAssistantProfile/);
    assert.match(src, /buildLiveConversationInstructions\(sessionVoice, profile\)/);
  });
});
