import type { Message } from "@/lib/types";
import {
  prepareTurnVisionImages,
  stripDataUrlPrefix,
  visionImagesToDataUrls,
} from "./vision-input.ts";

export { prepareTurnVisionImages, stripDataUrlPrefix as toOllamaImageBase64 } from "./vision-input.ts";

/** @deprecated Use prepareTurnVisionImages for turn-scoped vision input. */
export function normalizeVisionImages(urls: string[], limit = 4): string[] {
  const result = prepareTurnVisionImages(urls, limit);
  if (!result.ok) return [];
  return visionImagesToDataUrls(result.images);
}

/** Text the model sees for a stored UI message (includes attach notes / file bodies). */
export function modelContentFromMessage(message: Message): string {
  const parts: string[] = [];
  const text = message.content?.trim();
  if (text) parts.push(text);
  for (const block of message.blocks ?? []) {
    if (block.type === "image") {
      if (block.url?.startsWith("data:image/")) {
        parts.push("(Image attached — see image input.)");
      }
    } else if (block.type === "file") {
      if (block.text?.trim()) {
        parts.push(`File “${block.name}” contents:\n${block.text.trim()}`);
      } else {
        parts.push(`(User attached a file named “${block.name}”.)`);
      }
    }
  }
  return parts.join("\n\n").trim();
}

/**
 * Turn-scoped vision images for the current send only — never reuse prior turns.
 */
export function collectTurnVisionImages(
  currentUrls: string[],
  limit = 4,
): { ok: true; urls: string[] } | { ok: false; error: string } {
  const result = prepareTurnVisionImages(currentUrls, limit);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, urls: visionImagesToDataUrls(result.images) };
}

/** @deprecated Turn-scoped only — do not pass thread history. */
export function collectRecentImageDataUrls(
  _messages: Message[] | undefined,
  currentUrls: string[] = [],
  limit = 4,
): string[] {
  const result = prepareTurnVisionImages(currentUrls, limit);
  if (!result.ok) return [];
  return visionImagesToDataUrls(result.images);
}

export function imageTurnHint(count: number): string {
  if (count <= 0) return "";
  return count === 1
    ? "(1 image attached — describe and interpret what you see in the image pixels.)"
    : `(${count} images attached — describe and interpret what you see in the image pixels.)`;
}
