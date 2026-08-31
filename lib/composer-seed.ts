/**
 * Composer seed / pending share-in input.
 * Share-in NEVER auto-sends — user adds the ask.
 */

import type { ChatSendAttachment } from "@/lib/types";

export type ComposerPendingInput = {
  text?: string;
  attachments?: ChatSendAttachment[];
  /** Provenance for UI (share / drop / quick-ask). */
  source?: "share" | "drop" | "seed" | "quick-ask";
};

let seed: string | null = null;
let pending: ComposerPendingInput | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function setComposerSeed(text: string) {
  seed = text;
  emit();
}

export function peekComposerSeed() {
  return seed;
}

export function consumeComposerSeed() {
  const next = seed;
  seed = null;
  if (next !== null) emit();
  return next;
}

/** Queue share-in / drop content into the composer without sending. */
export function setComposerPendingInput(input: ComposerPendingInput) {
  pending = {
    text: input.text,
    attachments: input.attachments ? [...input.attachments] : undefined,
    source: input.source ?? "seed",
  };
  if (input.text) seed = input.text;
  emit();
}

export function peekComposerPendingInput() {
  return pending;
}

export function consumeComposerPendingInput(): ComposerPendingInput | null {
  const next = pending;
  pending = null;
  seed = null;
  if (next) emit();
  return next;
}

export function subscribeComposerSeed(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Parse cander://share?... deep links into pending composer input.
 * Never auto-sends.
 */
export function parseShareDeepLink(url: string): ComposerPendingInput | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "cander:" && !u.pathname.includes("share")) {
      // also allow https://cander.app/share?...
      if (!/share/i.test(u.pathname) && u.host !== "share") return null;
    }
    if (u.host === "share" || /\/share/i.test(u.pathname) || u.protocol === "cander:") {
      const text =
        u.searchParams.get("text") ||
        u.searchParams.get("title") ||
        u.searchParams.get("url") ||
        "";
      const imageDataUrl = u.searchParams.get("image");
      const attachments: ChatSendAttachment[] = [];
      if (imageDataUrl?.startsWith("data:image/")) {
        attachments.push({
          id: `share_${Math.random().toString(36).slice(2, 8)}`,
          type: "image",
          filename: "shared.jpeg",
          mimeType: "image/jpeg",
          size: Math.floor(imageDataUrl.length * 0.75),
          dataUrl: imageDataUrl,
        });
      }
      const link = u.searchParams.get("url");
      if (link && !text.includes(link)) {
        return {
          text: [text, link].filter(Boolean).join("\n").trim(),
          attachments: attachments.length ? attachments : undefined,
          source: "share",
        };
      }
      if (!text && !attachments.length) return null;
      return {
        text: text || undefined,
        attachments: attachments.length ? attachments : undefined,
        source: "share",
      };
    }
  } catch {
    return null;
  }
  return null;
}
