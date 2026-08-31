/**
 * Capability router — map Plan caps to existing tools. Never expose MCP names to FM.
 */

import { executeAuthorizedTool } from "../runtime/tools.ts";
import type { AiToolCallResult } from "../runtime/tools.ts";
import { createWriteOperation, isWriteTool } from "../orchestrator/write-safety.ts";
import type { Lookup, SimpleEvidence } from "./types.ts";
import { cacheKey } from "./state-store.ts";

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function looksLikeUrl(q: string): boolean {
  return /^https?:\/\//i.test(q.trim()) || /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(q.trim());
}

function normalizeUrl(q: string): string {
  const t = q.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

export async function executeLookup(opts: {
  lookup: Lookup;
  cache: Map<string, SimpleEvidence>;
  executeTool?: (opts: {
    name: string;
    arguments: Record<string, unknown>;
  }) => Promise<AiToolCallResult>;
}): Promise<SimpleEvidence> {
  const key = cacheKey(opts.lookup.cap, opts.lookup.q);
  const hit = opts.cache.get(key);
  if (hit?.ok && hit.accepted) {
    return { ...hit, cacheHit: true };
  }

  const exec =
    opts.executeTool ??
    ((args: { name: string; arguments: Record<string, unknown> }) =>
      executeAuthorizedTool(args));

  if (opts.lookup.cap === "CALENDAR" || opts.lookup.cap === "EMAIL" || opts.lookup.cap === "CRM") {
    return {
      id: newId("ev"),
      cap: opts.lookup.cap,
      query: opts.lookup.q,
      title: `${opts.lookup.cap} not available`,
      content:
        `${opts.lookup.cap} actions require confirmation and are not auto-executed. Ask the user to confirm before changing external state.`,
      ok: false,
      accepted: false,
      rejectReason: "write_or_connector_not_auto",
      retrievedAt: new Date().toISOString(),
      sourceTool: "none",
    };
  }

  if (opts.lookup.cap === "WEB") {
    const isUrl = looksLikeUrl(opts.lookup.q);
    const name = isUrl ? "web.read" : "web.search";
    const args = isUrl
      ? { url: normalizeUrl(opts.lookup.q) }
      : { query: opts.lookup.q, numResults: 5 };

    if (isWriteTool(name)) {
      const op = createWriteOperation({ toolName: name, args });
      if (op.status === "blocked") {
        return {
          id: newId("ev"),
          cap: "WEB",
          query: opts.lookup.q,
          title: "Blocked write",
          content: op.reason ?? "Requires confirmation",
          ok: false,
          accepted: false,
          rejectReason: "write_blocked",
          retrievedAt: new Date().toISOString(),
          sourceTool: name,
        };
      }
    }

    const result = await exec({ name, arguments: args });
    const content =
      (typeof result.output === "string" && result.output) ||
      (result.data ? JSON.stringify(result.data).slice(0, 4000) : "");
    const title =
      (result.data as { title?: string } | undefined)?.title ||
      (isUrl ? normalizeUrl(opts.lookup.q) : opts.lookup.q.slice(0, 80));
    const url = isUrl
      ? normalizeUrl(opts.lookup.q)
      : ((result.data as { url?: string } | undefined)?.url ?? null);

    const evidence: SimpleEvidence = {
      id: newId("ev"),
      cap: "WEB",
      query: opts.lookup.q,
      title,
      url,
      content: content.slice(0, 6000),
      ok: result.ok && content.trim().length >= 8,
      accepted: false,
      retrievedAt: new Date().toISOString(),
      sourceTool: name,
    };
    opts.cache.set(key, evidence);
    return evidence;
  }

  if (opts.lookup.cap === "MEMORY" || opts.lookup.cap === "FILES") {
    const name =
      opts.lookup.cap === "MEMORY" ? "knowledge.search" : "workspace.search";
    try {
      const result = await exec({
        name,
        arguments: { query: opts.lookup.q },
      });
      const content =
        (typeof result.output === "string" && result.output) ||
        JSON.stringify(result.data ?? {}).slice(0, 4000);
      return {
        id: newId("ev"),
        cap: opts.lookup.cap,
        query: opts.lookup.q,
        title: opts.lookup.q.slice(0, 80),
        content: content.slice(0, 6000),
        ok: result.ok && content.trim().length >= 8,
        accepted: false,
        retrievedAt: new Date().toISOString(),
        sourceTool: name,
      };
    } catch {
      return {
        id: newId("ev"),
        cap: opts.lookup.cap,
        query: opts.lookup.q,
        title: "Lookup failed",
        content: "",
        ok: false,
        accepted: false,
        rejectReason: "tool_error",
        retrievedAt: new Date().toISOString(),
        sourceTool: name,
      };
    }
  }

  if (opts.lookup.cap === "CALC") {
    // CALC evidence is a structured hint for deterministic answer; no external call.
    return {
      id: newId("ev"),
      cap: "CALC",
      query: opts.lookup.q,
      title: "Calculation request",
      content: opts.lookup.q,
      ok: true,
      accepted: false,
      retrievedAt: new Date().toISOString(),
      sourceTool: "calc",
    };
  }

  if (opts.lookup.cap === "BUILD") {
    return {
      id: newId("ev"),
      cap: "BUILD",
      query: opts.lookup.q,
      title: "Build capability",
      content:
        "Build turns should use the Build orchestrator path; not auto-executed here.",
      ok: false,
      accepted: false,
      rejectReason: "build_divert",
      retrievedAt: new Date().toISOString(),
      sourceTool: "build",
    };
  }

  return {
    id: newId("ev"),
    cap: opts.lookup.cap,
    query: opts.lookup.q,
    title: "Unsupported",
    content: "",
    ok: false,
    accepted: false,
    rejectReason: "unsupported_cap",
    retrievedAt: new Date().toISOString(),
    sourceTool: "none",
  };
}

export function toolResultsFromEvidence(
  items: SimpleEvidence[],
): Array<{ name: string; ok: boolean; output: string; data?: unknown }> {
  return items.map((e) => ({
    name: e.sourceTool,
    ok: e.ok,
    output: e.content,
    data: { title: e.title, url: e.url, query: e.query },
  }));
}
