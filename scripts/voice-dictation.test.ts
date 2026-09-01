/**
 * Voice dictation metering / MIME / cancel semantics.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { pickDictationMime } from "../lib/voice/openai-dictation.ts";
import {
  sampleCountForWidth,
  VOICE_WAVEFORM_STEP_MS,
  WAVEFORM_MIN_SAMPLES,
  WAVEFORM_MAX_SAMPLES,
} from "../lib/voice/audio-meter.ts";

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

  it("audio meter uses ChatGPT-like step interval and no random", () => {
    const src = fs.readFileSync("lib/voice/audio-meter.ts", "utf8");
    assert.ok(src.includes("AnalyserNode") || src.includes("createAnalyser"));
    assert.ok(src.includes("getByteTimeDomainData"));
    assert.match(src, /VOICE_WAVEFORM_STEP_MS\s*=\s*65/);
    assert.equal(src.includes("Math.random"), false);
    assert.equal(src.includes("OPENAI"), false);
    assert.equal(src.includes("transcribe"), false);
  });

  it("sample count is width-based and clamped", () => {
    assert.equal(VOICE_WAVEFORM_STEP_MS, 65);
    const narrow = sampleCountForWidth(80);
    const wide = sampleCountForWidth(900);
    assert.ok(narrow >= WAVEFORM_MIN_SAMPLES);
    assert.ok(wide <= WAVEFORM_MAX_SAMPLES);
    assert.ok(wide >= narrow);
  });

  it("waveform canvas uses fixed rolling window", () => {
    const src = fs.readFileSync(
      "components/shell/VoiceDictationWaveform.tsx",
      "utf8",
    );
    assert.ok(src.includes("canvas"));
    assert.ok(src.includes("sampleCountForWidth"));
    assert.ok(src.includes("copyWithin"));
    assert.ok(src.includes("VOICE_WAVEFORM_STEP_MS"));
    assert.equal(src.includes("Math.random"), false);
  });

  it("recording row is X | waveform | stop | send without Listening label", () => {
    const src = fs.readFileSync("components/shell/ComposerVoice.tsx", "utf8");
    assert.ok(src.includes("ComposerRecordingView"));
    assert.ok(src.includes("onSend"));
    assert.equal(/Listening[.…]/.test(src), false);
    assert.ok(src.includes("Transcribing…"));
    assert.equal(src.includes("VoiceWaveButton"), false);
    assert.match(src, /REC_BTN\s*=\s*28/);
    assert.ok(src.includes("justify-center"));
    assert.ok(src.includes('status === "transcribing"'));
  });

  it("composer keeps textarea mounted during dictation (keyboard stays open)", () => {
    const composer = fs.readFileSync("components/shell/Composer.tsx", "utf8");
    assert.ok(composer.includes("invisible pointer-events-none"));
    assert.ok(composer.includes("preventScroll: true"));
    assert.ok(
      composer.includes('status={transcribing ? "transcribing" : "recording"}'),
    );
    const voice = fs.readFileSync("components/shell/ComposerVoice.tsx", "utf8");
    assert.ok(voice.includes("onPointerDown"));
  });

  it("composer has no live-voice control wiring", () => {
    const src = fs.readFileSync("components/shell/Composer.tsx", "utf8");
    assert.ok(src.includes("cancelDictation"));
    assert.ok(src.includes("stopDictationAndTranscribe"));
    assert.ok(src.includes("startVoiceDictation"));
    assert.ok(src.includes('afterTranscriptionRef'));
    assert.ok(src.includes('"send"'));
    assert.ok(src.includes('"insert"'));
    assert.equal(src.includes("VoiceWaveButton"), false);
    assert.equal(src.includes("ComposerVoiceOrb"), false);
    assert.equal(src.includes("onStartVoice"), false);
    assert.equal(src.includes("toggleVoice"), false);
  });

  it("composer uses OpenAI dictation on web without raw chat mode flag", () => {
    const src = fs.readFileSync("components/shell/Composer.tsx", "utf8");
    assert.equal(src.includes("isRawOpenAIModeEnabled"), false);
    assert.ok(src.includes("isOpenAIDictationSupported"));
    assert.ok(src.includes("isDesktopShell"));
  });
});
