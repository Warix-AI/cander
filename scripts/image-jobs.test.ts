/**
 * Async image-generation job helpers (client + block shape).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createGeneratingImageBlock,
  newClientImageGenerationId,
} from "../lib/ai/raw-openai/image-jobs-client.ts";

describe("image generation jobs", () => {
  it("creates generating block with required fields", () => {
    const id = newClientImageGenerationId();
    assert.match(id, /^img_/);
    const block = createGeneratingImageBlock({
      generationId: id,
      prompt: "Utah State Capitol",
    });
    assert.equal(block.type, "image_generation");
    assert.equal(block.status, "generating");
    assert.equal(block.generationId, id);
    assert.equal(block.prompt, "Utah State Capitol");
    assert.equal(block.imageUrl, null);
  });

  it("ids are unique across calls", () => {
    const a = newClientImageGenerationId();
    const b = newClientImageGenerationId();
    assert.notEqual(a, b);
  });
});
