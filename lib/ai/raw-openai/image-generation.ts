/**
 * OpenAI native image_generation tool for raw Responses API mode.
 */

export function isOpenAIImageGenerationEnabled(): boolean {
  const v = process.env.OPENAI_IMAGE_GENERATION?.trim().toLowerCase();
  if (!v) return false;
  return v === "1" || v === "true" || v === "on";
}

/** Tool entry for Responses `tools` array. */
export function openAIImageGenerationTool(): { type: "image_generation" } {
  return { type: "image_generation" };
}
