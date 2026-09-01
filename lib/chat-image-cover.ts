import type { Message } from "@/lib/types";

/** Latest generated / attached image URL in a message list (newest message wins). */
export function imageCoverFromMessages(messages: Message[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const blocks = messages[i]?.blocks;
    if (!blocks?.length) continue;
    for (let j = blocks.length - 1; j >= 0; j--) {
      const block = blocks[j];
      if (!block) continue;
      if (block.type === "image" && block.url) return block.url;
      if (
        block.type === "image_generation" &&
        block.status === "completed" &&
        block.imageUrl
      ) {
        return block.imageUrl;
      }
    }
  }
  return undefined;
}

export function imageCoverFromBlocks(
  blocks: Message["blocks"] | null | undefined,
): string | undefined {
  if (!blocks?.length) return undefined;
  for (let j = blocks.length - 1; j >= 0; j--) {
    const block = blocks[j];
    if (!block) continue;
    if (block.type === "image" && block.url) return block.url;
    if (
      block.type === "image_generation" &&
      block.status === "completed" &&
      block.imageUrl
    ) {
      return block.imageUrl;
    }
  }
  return undefined;
}
