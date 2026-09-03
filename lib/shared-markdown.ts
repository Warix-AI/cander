/**
 * Shared markdown documents — public {id}.cander.app links for project tabs.
 */

import { APP_DOMAIN } from "@/lib/app-brand";

const SHARE_ID_RE = /^m[a-z0-9]{24}$/;

/** Generate a long public share id (subdomain-safe). */
export function newMarkdownShareId(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let out = "";
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i]! % alphabet.length]!;
  }
  // Pad/trim to 24 chars after the leading `m`
  while (out.length < 24) out += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  return `m${out.slice(0, 24)}`;
}

export function isMarkdownShareId(value: string): boolean {
  return SHARE_ID_RE.test(value.trim());
}

/** Public share URL: https://{id}.cander.app */
export function markdownShareUrl(shareId: string): string {
  const id = shareId.trim();
  return `https://${id}.${APP_DOMAIN}`;
}

/** Path fallback used by Next rewrite / local preview. */
export function markdownSharePath(shareId: string): string {
  return `/d/${shareId.trim()}`;
}

/**
 * Short tab title / summary for a markdown reply.
 * Prefer H1, then first real sentence, capped for the tab strip.
 */
export function summarizeMarkdownTitle(markdown: string, max = 48): string {
  const text = markdown.replace(/\r\n/g, "\n").trim();
  if (!text) return "Document";

  const h1 = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (h1) return clipTitle(stripMdInline(h1), max);

  const h2 = text.match(/^##\s+(.+)$/m)?.[1]?.trim();
  if (h2) return clipTitle(stripMdInline(h2), max);

  const plain = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("```") && !/^[-*|>]/.test(line))
    .map((line) => stripMdInline(line.replace(/^#{1,6}\s+/, "").replace(/^\d+\.\s+/, "")))
    .find((line) => line.length > 2);

  if (!plain) return "Document";
  const sentence = plain.split(/(?<=[.!?])\s+/)[0] ?? plain;
  return clipTitle(sentence, max);
}

function stripMdInline(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function clipTitle(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean || "Document";
  const sliced = clean.slice(0, max - 1);
  const cut = sliced.replace(/\s+\S*$/, "").trim() || sliced.trim();
  return `${cut}…`;
}
