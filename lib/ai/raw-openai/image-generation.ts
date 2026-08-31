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
    action: "generate",
  };
}

/**
 * Deterministic intent: user wants an image produced now.
 * Excludes meta questions ("how does image generation work?", "what model…").
 */
export function detectImageGenerationIntent(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;
  const t = raw.toLowerCase();

  // Meta / informational — stay in normal chat
  if (
    /\b(how|what|why|when|where|which|does|do you|can you|are you|explain|tell me about|describe how)\b/.test(
      t,
    ) &&
    /\b(image generation|generate images|generating images|dall-?e|gpt.?image|image model|create images)\b/.test(
      t,
    ) &&
    !/\b(generate|create|make|draw|render|paint|design|show)\b.{0,40}\b(me |an |a |the )?(image|picture|photo|illustration|artwork|drawing)\b/.test(
      t,
    )
  ) {
    return false;
  }
  if (
    /\b(what model|which model|how (do|does)|explain|tell me about)\b/.test(t) &&
    /\b(image|images|picture|photo)\b/.test(t)
  ) {
    return false;
  }

  // Explicit generation commands
  if (
    /\b(generate|create|make|draw|render|paint|design|sketch|illustrate)\b[\s\S]{0,80}\b(an? |the |me )?(image|picture|photo|illustration|artwork|drawing|render|portrait|logo|cartoon)\b/.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(generate|create|make|draw|render|paint|design|sketch|illustrate)\b[\s\S]{0,60}\b(cartoon|anime|photorealistic|pixel art|watercolor|oil painting)\b/.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(image|picture|photo|illustration|artwork|drawing|cartoon)\b[\s\S]{0,40}\b(of|showing|with|featuring)\b/.test(
      t,
    ) &&
    /\b(generate|create|make|draw|render|paint|design|sketch|illustrate|show me)\b/.test(
      t,
    )
  ) {
    return true;
  }
  if (/^(draw|paint|illustrate|render)\b/.test(t)) return true;
  if (/\b(show me|give me)\b[\s\S]{0,40}\b(an? |a )?(image|picture|photo|illustration)\b/.test(t)) {
    return true;
  }

  return false;
}

/** Force the Responses image_generation tool. */
export function openAIImageGenerationToolChoice(): {
  type: "image_generation";
} {
  return { type: "image_generation" };
}
