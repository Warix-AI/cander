/**
 * Collect durable WebSource-shaped citations from tool results.
 * Never invents URLs — only passes through validated http(s) links.
 */

import type { AiToolCallResult } from "@/lib/ai/runtime/tools";
import type { Message } from "@/lib/types";

export type MessageCitation = NonNullable<Message["citations"]>[number];

function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function canonicalKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const path = u.pathname.replace(/\/$/, "") || "/";
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function fromUnknown(raw: unknown, fallbackId: string): MessageCitation | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const url = String(row.url ?? "").trim();
  if (!url || !isSafeHttpUrl(url)) return null;
  const title = String(row.title ?? row.domain ?? url).slice(0, 200);
  const domain =
    typeof row.domain === "string"
      ? row.domain
      : (() => {
          try {
            return new URL(url).hostname.replace(/^www\./, "");
          } catch {
            return undefined;
          }
        })();
  return {
    id: String(row.id ?? fallbackId).slice(0, 80),
    title,
    url,
    canonicalUrl:
      typeof row.canonicalUrl === "string" ? row.canonicalUrl : url,
    domain,
    excerpt:
      typeof row.excerpt === "string"
        ? row.excerpt.slice(0, 400)
        : typeof row.description === "string"
          ? row.description.slice(0, 400)
          : typeof row.snippet === "string"
            ? row.snippet.slice(0, 400)
            : undefined,
    publishedAt:
      typeof row.publishedAt === "string" ? row.publishedAt : undefined,
    retrievedAt:
      typeof row.retrievedAt === "string"
        ? row.retrievedAt
        : new Date().toISOString(),
    sourceType:
      typeof row.sourceType === "string" ? row.sourceType : undefined,
  };
}

/** Normalize Edge/client citation payloads into Message.citations. */
export function normalizeMessageCitations(
  raw: unknown,
): MessageCitation[] {
  if (!Array.isArray(raw)) return [];
  const out: MessageCitation[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const c = fromUnknown(raw[i], `src_${i + 1}`);
    if (!c) continue;
    const key = canonicalKey(c.canonicalUrl || c.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Pull citations from web.* tool data (and explicit citations arrays). */
export function collectCitationsFromToolResults(
  toolResults: AiToolCallResult[] | undefined,
): MessageCitation[] {
  if (!toolResults?.length) return [];
  const collected: unknown[] = [];
  for (const result of toolResults) {
    if (
      result.name !== "web.search" &&
      result.name !== "web.open" &&
      result.name !== "web.read" &&
      result.name !== "web.research"
    ) {
      continue;
    }
    const data = result.data as Record<string, unknown> | undefined;
    if (Array.isArray(data?.citations)) {
      collected.push(...data.citations);
      continue;
    }
    if (Array.isArray(data?.results)) {
      collected.push(
        ...data.results.map((r, i) => ({
          ...(typeof r === "object" && r ? r : {}),
          id: `web_${result.name}_${i + 1}`,
          sourceType: result.name === "web.research" ? "deep-research" : "search",
        })),
      );
    }
    if (data?.url || data?.finalUrl) {
      collected.push({
        id: `page_${collected.length + 1}`,
        title: data.title,
        url: data.finalUrl || data.url,
        excerpt:
          typeof data.text === "string" ? data.text.slice(0, 400) : undefined,
        sourceType: "page",
        retrievedAt: new Date().toISOString(),
      });
    }
  }
  return normalizeMessageCitations(collected);
}
