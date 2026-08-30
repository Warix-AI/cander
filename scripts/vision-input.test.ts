/**
 * Vision input pipeline tests.
 * Run: npm run test:orchestrator
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertVisionModelSelected,
  prepareTurnVisionImages,
  stripDataUrlPrefix,
} from "../lib/ai/vision-input.ts";

const JPEG_B64 = "a".repeat(120);
const JPEG_DATA = `data:image/jpeg;base64,${JPEG_B64}`;
const PNG_DATA = `data:image/png;base64,${"b".repeat(120)}`;

describe("prepareTurnVisionImages", () => {
  it("accepts valid JPEG data URL", () => {
    const r = prepareTurnVisionImages([JPEG_DATA]);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.images.length, 1);
    assert.equal(r.images[0]!.mime, "image/jpeg");
    assert.ok(r.images[0]!.byteSize > 0);
  });

  it("accepts valid PNG data URL", () => {
    const r = prepareTurnVisionImages([PNG_DATA]);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.images[0]!.mime, "image/png");
  });

  it("accepts multiple images up to limit", () => {
    const urls = [JPEG_DATA, PNG_DATA, JPEG_DATA, PNG_DATA, JPEG_DATA];
    const r = prepareTurnVisionImages(urls, 4);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.images.length, 4);
  });

  it("rejects missing image bytes", () => {
    const r = prepareTurnVisionImages(["https://example.com/photo.jpg"]);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, "VISION_INVALID_FORMAT");
  });

  it("rejects unsupported mime type", () => {
    const heic = `data:image/heic;base64,${JPEG_B64}`;
    const r = prepareTurnVisionImages([heic]);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, "VISION_UNSUPPORTED_MIME");
  });

  it("rejects tiny/empty base64 payload", () => {
    const r = prepareTurnVisionImages(["data:image/jpeg;base64,abc"]);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, "VISION_MISSING_BYTES");
  });

  it("is turn-scoped — ignores would-be stale history (caller passes current only)", () => {
    const current = prepareTurnVisionImages([JPEG_DATA]);
    assert.equal(current.ok, true);
    // Prior-turn URLs must not be passed by caller; empty current = no images.
    const noCurrent = prepareTurnVisionImages([]);
    assert.equal(noCurrent.ok, true);
    if (!noCurrent.ok) return;
    assert.equal(noCurrent.images.length, 0);
  });
});

describe("assertVisionModelSelected", () => {
  it("blocks text-only model when images present", () => {
    assert.throws(
      () => assertVisionModelSelected(true, "llama3.2", "llama3.2"),
      /text-only/i,
    );
  });

  it("allows vision model when images present", () => {
    assert.doesNotThrow(() =>
      assertVisionModelSelected(true, "llama3.2-vision", "llama3.2"),
    );
  });

  it("allows text model when no images", () => {
    assert.doesNotThrow(() =>
      assertVisionModelSelected(false, "llama3.2", "llama3.2"),
    );
  });
});

describe("stripDataUrlPrefix", () => {
  it("extracts raw base64", () => {
    assert.equal(stripDataUrlPrefix(JPEG_DATA), JPEG_B64);
  });
});

describe("collectTurnVisionImages (attachment-context)", () => {
  it("wraps prepareTurnVisionImages for client send path", async () => {
    const { collectTurnVisionImages } = await import(
      "../lib/ai/attachment-context.ts"
    );
    const ok = collectTurnVisionImages([JPEG_DATA]);
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.urls.length, 1);
    assert.match(ok.urls[0]!, /^data:image\//);
  });
});
