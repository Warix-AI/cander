/**
 * Attachment / vision helpers — client tests mirror.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectRecentImageDataUrls,
  imageTurnHint,
  normalizeVisionImages,
  toOllamaImageBase64,
} from "../lib/ai/attachment-context.ts";

describe("vision attachments", () => {
  it("strips data URL prefix for Ollama", () => {
    assert.equal(
      toOllamaImageBase64("data:image/jpeg;base64,abc123"),
      "abc123",
    );
  });

  it("normalizes raw base64 into data URLs", () => {
    const b64 = "a".repeat(40);
    const out = normalizeVisionImages([b64]);
    assert.equal(out.length, 1);
    assert.match(out[0]!, /^data:image\/jpeg;base64,/);
  });

  it("collects up to 4 recent images", () => {
    const urls = Array.from({ length: 5 }, (_, i) =>
      `data:image/jpeg;base64,${"x".repeat(40)}${i}`,
    );
    const collected = collectRecentImageDataUrls(undefined, urls, 4);
    assert.equal(collected.length, 4);
  });

  it("builds image turn hint", () => {
    assert.match(imageTurnHint(1), /1 image attached/i);
    assert.match(imageTurnHint(2), /2 images attached/i);
  });
});
