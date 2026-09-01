import type { Message, Thread } from "@/lib/types";
import { chatAttachmentImageUrl } from "@/lib/chat-attachment-image-url";

/** Strip bulky bytes from threads before localStorage — images stay in memory + Supabase. */
export function stripThreadsForLocalStorage(threads: Thread[]): Thread[] {
  return threads.map((thread) => ({
    ...thread,
    messages: thread.messages.map(stripMessageForLocalStorage),
  }));
}

function stripMessageForLocalStorage(message: Message): Message {
  if (!message.blocks?.length) return message;
  return {
    ...message,
    blocks: message.blocks.map((block) => {
      if (block.type === "image" && block.url?.startsWith("data:image/")) {
        return {
          ...block,
          url: block.attachmentId ? chatAttachmentImageUrl(block.attachmentId) : "",
        };
      }
      if (
        block.type === "image_generation" &&
        block.imageUrl?.startsWith("data:image/")
      ) {
        return {
          ...block,
          imageUrl: block.attachmentId
            ? chatAttachmentImageUrl(block.attachmentId)
            : "",
        };
      }
      if (block.type === "file" && block.text && block.text.length > 4_000) {
        return { ...block, text: block.text.slice(0, 4_000) };
      }
      return block;
    }),
  };
}

export function estimateThreadsJsonBytes(threads: Thread[]): number {
  try {
    return new TextEncoder().encode(JSON.stringify(threads)).length;
  } catch {
    return -1;
  }
}
