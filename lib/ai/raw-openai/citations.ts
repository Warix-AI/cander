/**
 * Pull http(s) URL citations from OpenAI Responses output.
 * Never invents links — only url_citation annotations and source rows.
 */

import {
  normalizeMessageCitations,
  type MessageCitation,
} from "../orchestrator/collect-citations.ts";

export { normalizeMessageCitations };
export type { MessageCitation };

export function extractOpenAICitations(output: unknown): MessageCitation[] {
  const collected: unknown[] = [];
  walk(output, collected);
  return normalizeMessageCitations(collected);
}

function walk(node: unknown, collected: unknown[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, collected);
    return;
  }
  if (typeof node !== "object") return;
  const row = node as Record<string, unknown>;
  const type = typeof row.type === "string" ? row.type : "";

  if (type === "url_citation" || type === "citation") {
    const nested =
      row.url_citation && typeof row.url_citation === "object"
        ? (row.url_citation as Record<string, unknown>)
        : row;
    collected.push({
      id: nested.url,
      title: nested.title,
      url: nested.url,
      sourceType: "web",
    });
  }

  if (Array.isArray(row.annotations)) walk(row.annotations, collected);
  if (Array.isArray(row.content)) walk(row.content, collected);
  if (Array.isArray(row.sources)) walk(row.sources, collected);
  if (Array.isArray(row.results)) walk(row.results, collected);
  if (row.action && typeof row.action === "object") walk(row.action, collected);
}
