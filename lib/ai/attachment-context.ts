import type { Message } from "@/lib/types";

/** Strip data-URL prefix for Ollama `images` fields. */
export function toOllamaImageBase64(dataUrlOrBase64: string): string {
  const raw = (dataUrlOrBase64 || "").trim();
  const match = raw.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  return (match?.[1] ?? raw).replace(/\s/g, "");
}

/** Text the model sees for a stored UI message (includes attach notes / file bodies). */
export function modelContentFromMessage(message: Message): string {
  const parts: string[] = [];
  const text = message.content?.trim();
  if (text) parts.push(text);
  for (const block of message.blocks ?? []) {
    if (block.type === "image") {
      // Pixels travel via `images[]` — never imply vision from the filename alone.
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

/** Collect recent image data-URLs from the thread + current attachments (max 2). */
export function collectRecentImageDataUrls(
  messages: Message[] | undefined,
  currentUrls: string[] = [],
  limit = 2,
): string[] {
  const out: string[] = [];
  const push = (url: string) => {
    if (!url.startsWith("data:image/")) return;
    if (out.includes(url)) return;
    if (out.length >= limit) return;
    out.push(url);
  };
  for (const url of currentUrls) push(url);
  for (const message of [...(messages ?? [])].reverse()) {
    if (out.length >= limit) break;
    for (const block of message.blocks ?? []) {
      if (block.type === "image") push(block.url);
      if (out.length >= limit) break;
    }
  }
  return out;
}
