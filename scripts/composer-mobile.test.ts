/**
 * Composer autosize + mobile send/dictation routing regressions.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPOSER_DESKTOP_MAX_LINES,
  COMPOSER_MOBILE_MAX_LINES,
  nextComposerTextareaSize,
  resolveComposerAutosizeMetrics,
} from "../lib/composer-autosize.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readRepo(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("composer autosize", () => {
  it("starts at one line (min height)", () => {
    const metrics = resolveComposerAutosizeMetrics({
      mobile: true,
      lineHeight: 20,
      paddingY: 12,
    });
    const empty = nextComposerTextareaSize(0, metrics, { empty: true });
    assert.equal(empty.height, metrics.minHeight);
    assert.equal(empty.overflowY, "hidden");
  });

  it("grows for 3 lines without scrolling", () => {
    const metrics = resolveComposerAutosizeMetrics({
      mobile: true,
      lineHeight: 20,
      paddingY: 12,
    });
    const three = nextComposerTextareaSize(20 * 3 + 12, metrics);
    assert.equal(three.height, 20 * 3 + 12);
    assert.equal(three.overflowY, "hidden");
  });

  it("caps mobile growth at ~6 lines", () => {
    const metrics = resolveComposerAutosizeMetrics({
      mobile: true,
      lineHeight: 20,
      paddingY: 12,
    });
    assert.equal(metrics.maxLines, COMPOSER_MOBILE_MAX_LINES);
    const six = nextComposerTextareaSize(metrics.maxHeight, metrics);
    assert.equal(six.height, metrics.maxHeight);
    assert.equal(six.overflowY, "hidden");
  });

  it("scrolls internally after 7+ lines on mobile", () => {
    const metrics = resolveComposerAutosizeMetrics({
      mobile: true,
      lineHeight: 20,
      paddingY: 12,
    });
    const seven = nextComposerTextareaSize(20 * 7 + 12, metrics);
    assert.equal(seven.height, metrics.maxHeight);
    assert.equal(seven.overflowY, "auto");
  });

  it("keeps a higher desktop line budget", () => {
    const metrics = resolveComposerAutosizeMetrics({
      mobile: false,
      lineHeight: 20,
      paddingY: 12,
    });
    assert.equal(metrics.maxLines, COMPOSER_DESKTOP_MAX_LINES);
  });

  it("send resets by treating empty value as one-line height", () => {
    const metrics = resolveComposerAutosizeMetrics({
      mobile: true,
      lineHeight: 20,
      paddingY: 0,
    });
    const afterSend = nextComposerTextareaSize(200, metrics, { empty: true });
    assert.equal(afterSend.height, metrics.minHeight);
    assert.equal(afterSend.overflowY, "hidden");
  });
});

describe("composer mobile alignment + send", () => {
  it("bottom-aligns + / mic / send on mobile", () => {
    const composer = readRepo("components/shell/Composer.tsx");
    assert.match(composer, /mobile \? "items-end"/);
    assert.match(composer, /mobile \? "self-end"/);
    assert.match(composer, /onSend=\{submit\}/);
  });

  it("Send button invokes explicit onClick (iOS-safe)", () => {
    const voice = readRepo("components/shell/ComposerVoice.tsx");
    assert.match(voice, /onClick\?: \(\) => void/);
    assert.match(voice, /event\.preventDefault\(\);\s*onClick\(\)/);
  });

  it("ChatColumn accepts sendAttachments for photo/file sends", () => {
    const chat = readRepo("components/shell/ChatColumn.tsx");
    assert.match(chat, /sendAttachments\?/);
    assert.match(chat, /opts\?\.sendAttachments\?\.length/);
  });

  it("lifts composer with margin, not transform (hit-testing)", () => {
    const css = readRepo("app/globals.css");
    assert.match(css, /margin-bottom:\s*var\(--keyboard-inset/);
    assert.doesNotMatch(
      css,
      /composer-keyboard-pad[^{]*\{[^}]*transform:\s*translateY/,
    );
  });
});

describe("speech dictation routing", () => {
  it("checks Electron before browser SpeechRecognition", () => {
    const speech = readRepo("lib/voice/speech-to-text.ts");
    assert.match(speech, /isDesktopShell/);
    assert.match(speech, /getDesktopSpeech|canderDesktop/);
    assert.match(speech, /Electron must never use browser/);
    assert.match(speech, /resolveSpeechToTextRoute/);
    assert.doesNotMatch(
      speech,
      /if \(isMobileShell\(\) && getCapSpeech\(\)\)[\s\S]*startWebSpeech/,
    );
  });

  it("exposes Electron speech preload bridge", () => {
    const preload = readRepo("desktop/src/preload.js");
    assert.match(preload, /speech:\s*\{/);
    assert.match(preload, /cander:speech-start/);
    const main = readRepo("desktop/src/main.js");
    assert.match(main, /speech-bridge/);
    assert.match(main, /speechBridge\.bindIpc/);
  });

  it("ships SpeechHelper native source", () => {
    const helper = readRepo("desktop/native/SpeechHelper/main.swift");
    assert.match(helper, /SFSpeechRecognizer/);
    assert.match(helper, /supportsOnDeviceRecognition/);
    assert.match(helper, /requiresOnDeviceRecognition/);
  });
});
