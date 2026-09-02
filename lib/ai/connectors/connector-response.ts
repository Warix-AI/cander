/**
 * User-facing connector replies — never expose tools, APIs, or orchestration jargon.
 */

import type { AiToolCallResult } from "../runtime/tools.ts";
import { sanitizeAssistantVisibleText } from "../tool-protocol.ts";

export const CONNECTOR_USER_VOICE_RULES = `When answering after connector data:
- Speak like a helpful assistant, not a system log.
- Never mention tools, tool results, APIs, connectors, searches being "requested", follow-up queries, or that you "can't confirm" because of missing data.
- If nothing matched, say so plainly (e.g. "I don't see any new emails" or "No emails matched that").
- Keep it to 1–3 short sentences.`;

type GmailSearchPayload = { count?: number; messages?: unknown[] };

export function parseGmailSearchPayload(output: string): GmailSearchPayload | null {
  try {
    const parsed = JSON.parse(output) as GmailSearchPayload;
    if (parsed && typeof parsed === "object" && typeof parsed.count === "number") {
      return parsed;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

export function isEmptyGmailSearchResult(result: AiToolCallResult): boolean {
  if (result.name !== "gmail.search" || !result.ok) return false;
  const payload = parseGmailSearchPayload(result.output);
  return payload !== null && payload.count === 0;
}

export function gmailEmptyResultMessage(userMessage: string): string {
  const lower = (userMessage || "").toLowerCase();
  if (/\b(again|another|new|since|follow|came through|came in)\b/.test(lower)) {
    return "I don't see any new emails — nothing new came through for that.";
  }
  if (/\b(latest|recent|last|unread)\b/.test(lower)) {
    return "I didn't find any recent emails matching that.";
  }
  return "I didn't find any emails matching that.";
}

const INTERNAL_CONNECTOR_PATTERNS = [
  /\btool results?\b/i,
  /\bgmail search\b/i,
  /\bfollow-?up\b.*\b(search|gmail|email)\b/i,
  /\b(search|query) was requested\b/i,
  /\bno new tool\b/i,
  /\bconnector\b/i,
  /\bcan'?t confirm whether\b/i,
  /\bwere(?:n't| not) returned\b/i,
  /\breturned,?\s+so i\b/i,
  /\bbut no\b.*\bresults?\b.*\breturned\b/i,
];

export function looksLikeInternalConnectorReply(text: string): boolean {
  const trimmed = (text || "").trim();
  if (!trimmed) return false;
  return INTERNAL_CONNECTOR_PATTERNS.some((re) => re.test(trimmed));
}

export function finalizeConnectorReply(input: {
  text: string;
  connectorId: "gmail";
  userMessage: string;
  toolResults?: AiToolCallResult[];
}): string {
  const sanitized = sanitizeAssistantVisibleText(input.text).trim();
  const lastSearch = [...(input.toolResults ?? [])]
    .reverse()
    .find((r) => r.name === "gmail.search" && r.ok);
  const emptySearch = lastSearch ? isEmptyGmailSearchResult(lastSearch) : false;

  if (emptySearch && (!sanitized || looksLikeInternalConnectorReply(sanitized))) {
    return gmailEmptyResultMessage(input.userMessage);
  }

  if (looksLikeInternalConnectorReply(sanitized)) {
    if (emptySearch) return gmailEmptyResultMessage(input.userMessage);
    return "I couldn't find anything in your email that matches that.";
  }

  return sanitized || gmailEmptyResultMessage(input.userMessage);
}
