/**
 * Attachment / vision helpers — client tests mirror.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectTurnVisionImages,
  imageTurnHint,
  toOllamaImageBase64,
} from "../lib/ai/attachment-context.ts";

const JPEG_DATA = `data:image/jpeg;base64,${"a".repeat(120)}`;

describe("vision attachments", () => {
  it("strips data URL prefix for Ollama", () => {
    assert.equal(
      toOllamaImageBase64("data:image/jpeg;base64,abc123"),
      "abc123",
    );
  });

  it("validates turn-scoped JPEG", () => {
    const out = collectTurnVisionImages([JPEG_DATA]);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.urls.length, 1);
  });

  it("builds image turn hint", () => {
    assert.match(imageTurnHint(1), /1 image attached/i);
    assert.match(imageTurnHint(2), /2 images attached/i);
  });
});
