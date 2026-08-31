/**
 * Voice dictation metering / MIME / cancel semantics.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { pickDictationMime } from "../lib/voice/openai-dictation.ts";

describe("Dictation MIME selection", () => {
  it("returns a mime descriptor object", () => {
    const mime = pickDictationMime();
    assert.equal(typeof mime.mimeType, "string");
    assert.equal(typeof mime.extension, "string");
    assert.ok(mime.extension.length > 0);
  });
});

describe("Dictation isolation", () => {
  it("openai-dictation never imports Apple speech", () => {
    const src = fs.readFileSync("lib/voice/openai-dictation.ts", "utf8");
    assert.equal(src.includes("SpeechRecognition"), false);
    assert.equal(src.includes("speech-recognition"), false);
    assert.equal(src.includes("SpeechHelper"), false);
    assert.ok(src.includes("MediaRecorder"));
    assert.ok(src.includes("createAudioMeter"));
    assert.ok(src.includes("cancel"));
    assert.ok(src.includes("stopAndTranscribe"));
  });

  it("audio meter is local-only Web Audio", () => {
    const src = fs.readFileSync("lib/voice/audio-meter.ts", "utf8");
    assert.ok(src.includes("AnalyserNode") || src.includes("createAnalyser"));
    assert.ok(src.includes("getByteTimeDomainData"));
    assert.equal(src.includes("OPENAI"), false);
    assert.equal(src.includes("transcribe"), false);
  });

  it("waveform uses canvas + meter history", () => {
    const src = fs.readFileSync(
      "components/shell/VoiceDictationWaveform.tsx",
      "utf8",
    );
    assert.ok(src.includes("canvas"));
    assert.ok(src.includes("getHistory"));
    assert.equal(src.includes("Math.random"), false);
  });

  it("composer cancel path distinct from stopAndTranscribe", () => {
    const src = fs.readFileSync("components/shell/Composer.tsx", "utf8");
    assert.ok(src.includes("cancelDictation"));
    assert.ok(src.includes("stopDictationAndTranscribe"));
    assert.ok(src.includes("startVoiceDictation"));
  });
});
