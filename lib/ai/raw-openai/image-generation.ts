/**
 * OpenAI native image_generation tool for raw Responses API mode.
 */

import type OpenAI from "openai";

export function isOpenAIImageGenerationEnabled(): boolean {
  const v = process.env.OPENAI_IMAGE_GENERATION?.trim().toLowerCase();
  if (!v) return false;
  return v === "1" || v === "true" || v === "on";
}

export function resolveOpenAIImageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1.5";
}

export function resolveOpenAIImageQuality(): "low" | "medium" | "high" | "auto" {
  const q = process.env.OPENAI_IMAGE_QUALITY?.trim().toLowerCase();
  if (q === "low" || q === "medium" || q === "high" || q === "auto") return q;
  return "medium";
}

/** Tool entry for Responses `tools` array. */
export function openAIImageGenerationTool(): OpenAI.Responses.Tool.ImageGeneration {
  return {
    type: "image_generation",
    model: resolveOpenAIImageModel(),
    quality: resolveOpenAIImageQuality(),
  };
}
