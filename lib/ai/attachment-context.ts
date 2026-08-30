import type { Message } from "@/lib/types";

/** Strip data-URL prefix for Ollama `images` fields. */
export function toOllamaImageBase64(dataUrlOrBase64: string): string {
  const raw = (dataUrlOrBase64 || "").trim();
  const match = raw.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  return (match?.[1] ?? raw).replace(/\s/g, "");
}

/** Validate and normalize image payloads before sending to vision models. */
export function normalizeVisionImages(
  urls: string[],
  limit = 4,
): string[] {
  const out: string[] = [];
  for (const raw of urls) {
    const trimmed = (raw || "").trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("data:image/")) {
      const b64 = toOllamaImageBase64(trimmed);
      if (b64.length < 32) continue;
      out.push(trimmed);
      continue;
    }
    // Raw base64 without prefix — wrap as JPEG for downstream consistency.
    if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.replace(/\s/g, "").length >= 32) {
      out.push(`data:image/jpeg;base64,${trimmed.replace(/\s/g, "")}`);
    }
  }
  return out.slice(0, limit);
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

/** Collect recent image data-URLs from the thread + current attachments. */
export function collectRecentImageDataUrls(
  messages: Message[] | undefined,
  currentUrls: string[] = [],
  limit = 4,
): string[] {
  const candidates: string[] = [];
  const push = (url: string) => {
    if (!url.startsWith("data:image/")) return;
    if (candidates.includes(url)) return;
    candidates.push(url);
  };
  for (const url of currentUrls) push(url);
  for (const message of [...(messages ?? [])].reverse()) {
    for (const block of message.blocks ?? []) {
      if (block.type === "image") push(block.url);
    }
  }
  return normalizeVisionImages(candidates, limit);
}

/** User-visible hint when image bytes are present for the current turn. */
export function imageTurnHint(count: number): string {
  if (count <= 0) return "";
  return count === 1
    ? "(1 image attached — describe and interpret what you see in the image pixels.)"
    : `(${count} images attached — describe and interpret what you see in the image pixels.)`;
}
