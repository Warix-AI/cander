/**
 * Capability router — map Plan caps to existing tools. Never expose MCP names to FM.
 */

import type { AiToolCallResult } from "../runtime/tools.ts";
import {
  normalizeExplicitUrl,
  siteSearchQueryForUrl,
  urlHostMatchesRequestedDomain,
} from "../orchestrator/url-open-path.ts";
import {
  EXA_SEARCH_TYPE,
  lightFormatExaText,
  logExaDeep,
} from "./exa-deep.ts";
import type { Lookup, SimpleEvidence } from "./types.ts";
import { cacheKey } from "./state-store.ts";

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Open-web search args — Exa type=deep only; canonical query, never raw user prose. */
export function webSearchArgsForLookup(lookup: Lookup): Record<string, unknown> {
  return {
    query: lookup.q,
    numResults: 8,
    retrievalMode: EXA_SEARCH_TYPE,
  };
}

function citationsFromToolData(data: unknown): Array<{ title?: string; url?: string | null }> {
  if (!data || typeof data !== "object") return [];
  const row = data as Record<string, unknown>;
  const citations = row.citations;
  if (Array.isArray(citations)) {
    return citations
      .slice(0, 8)
      .map((c) => {
        if (!c || typeof c !== "object") return {};
        const r = c as Record<string, unknown>;
        return {
          title: typeof r.title === "string" ? r.title : undefined,
          url: typeof r.url === "string" ? r.url : null,
        };
      });
  }
  const results = row.results;
  if (Array.isArray(results)) {
    return results.slice(0, 8).map((c) => {
      if (!c || typeof c !== "object") return {};
      const r = c as Record<string, unknown>;
      return {
        title: typeof r.title === "string" ? r.title : undefined,
        url: typeof r.url === "string" ? r.url : null,
      };
    });
  }
  return [];
}

function extractExaContent(result: AiToolCallResult): string {
  const data = result.data as Record<string, unknown> | undefined;
  const synthesis = data?.synthesis as { directAnswer?: string } | undefined;
  const direct =
    (typeof data?.directAnswer === "string" && data.directAnswer.trim()) ||
    (typeof synthesis?.directAnswer === "string" &&
      synthesis.directAnswer.trim()) ||
    "";
  if (direct) return lightFormatExaText(direct);
  const output = typeof result.output === "string" ? result.output : "";
  if (output) return lightFormatExaText(output);
  if (data) return lightFormatExaText(JSON.stringify(data).slice(0, 4000));
  return "";
}

export async function executeLookup(opts: {
  lookup: Lookup;
  cache: Map<string, SimpleEvidence>;
  executeTool?: (opts: {
    name: string;
    arguments: Record<string, unknown>;
  }) => Promise<AiToolCallResult>;
}): Promise<SimpleEvidence> {
  const key = cacheKey(
    opts.lookup.cap,
    `${opts.lookup.q}|${opts.lookup.retrievalMode ?? opts.lookup.escalate ?? ""}|${opts.lookup.deeper ? "d" : ""}`,
  );
  const hit = opts.cache.get(key);
  if (hit?.ok && hit.accepted) {
    return { ...hit, cacheHit: true };
  }

  const exec =
    opts.executeTool ??
    (async (args: { name: string; arguments: Record<string, unknown> }) => {
      const { executeAuthorizedTool } = await import("../runtime/tools.ts");
      return executeAuthorizedTool(args);
    });

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
    const normalized = normalizeExplicitUrl(opts.lookup.q);
    const isSiteFallback = /^site:/i.test(opts.lookup.q.trim());
    const isUrl = Boolean(normalized) && !isSiteFallback;

    // Explicit URL/domain → web.read first (never agent / deep research).
    if (isUrl && normalized) {
      console.log("[SIMPLE_TURN_URL_OPEN]", {
        raw: opts.lookup.q.slice(0, 200),
        normalizedUrl: normalized.url,
        domain: normalized.domain,
      });
      const result = await exec({
        name: "web.read",
        arguments: { url: normalized.url },
      });
      const content =
        (typeof result.output === "string" && result.output) ||
        (result.data ? JSON.stringify(result.data).slice(0, 4000) : "");
      const finalUrl =
        (result.data as { finalUrl?: string } | undefined)?.finalUrl ??
        normalized.url;
      const domainOk = urlHostMatchesRequestedDomain(
        finalUrl,
        normalized.domain,
      );
      const ok = result.ok && content.trim().length >= 8 && domainOk;

      if (!ok) {
        // Fall back once to site:domain search — still Exa type=deep (only search mode).
        const siteQ = siteSearchQueryForUrl(normalized.url);
        console.log("[SIMPLE_TURN_URL_SITE_FALLBACK]", {
          from: normalized.url,
          to: siteQ,
          readOk: result.ok,
          domainOk,
        });
        const search = await exec({
          name: "web.search",
          arguments: {
            query: siteQ,
            numResults: 8,
            retrievalMode: EXA_SEARCH_TYPE,
          },
        });
        const searchContent = extractExaContent(search);
        const evidence: SimpleEvidence = {
          id: newId("ev"),
          cap: "WEB",
          query: siteQ,
          title:
            (search.data as { title?: string } | undefined)?.title ||
            siteQ.slice(0, 80),
          url:
            (search.data as { url?: string } | undefined)?.url ??
            normalized.url,
          content: searchContent.slice(0, 6000),
          ok: search.ok && searchContent.trim().length >= 8,
          accepted: false,
          rejectReason:
            search.ok && searchContent.trim().length >= 8
              ? undefined
              : "url_fetch_and_site_search_failed",
          retrievedAt: new Date().toISOString(),
          sourceTool: "web.search",
        };
        opts.cache.set(key, evidence);
        return evidence;
      }

      const evidence: SimpleEvidence = {
        id: newId("ev"),
        cap: "WEB",
        query: opts.lookup.q,
        title:
          (result.data as { title?: string } | undefined)?.title ||
          normalized.url,
        url: finalUrl,
        content: content.slice(0, 6000),
        ok: true,
        accepted: false,
        retrievedAt: new Date().toISOString(),
        sourceTool: "web.read",
      };
      opts.cache.set(key, evidence);
      return evidence;
    }

    // Open-web → Exa Search type=deep only (canonical intent query).
    const name = "web.search";
    const args = webSearchArgsForLookup(opts.lookup);
    const normalizedQuery = String(args.query);
    logExaDeep({
      stage: opts.lookup.escalate || /official|refine/i.test(opts.lookup.q)
        ? "retry"
        : "request",
      normalizedQuery,
      exaType: EXA_SEARCH_TYPE,
      intentId: opts.lookup.intentId,
      retryQuery: opts.lookup.escalate ? normalizedQuery : undefined,
    });
    const result = await exec({ name, arguments: args });
    const content = extractExaContent(result);
    const citations = citationsFromToolData(result.data);
    const title =
      (result.data as { title?: string } | undefined)?.title ||
      citations[0]?.title ||
      opts.lookup.q.slice(0, 80);
    const url =
      (result.data as { url?: string } | undefined)?.url ??
      citations[0]?.url ??
      null;
    const ok = result.ok && content.trim().length >= 8;

    logExaDeep({
      stage: "response",
      normalizedQuery,
      exaType: EXA_SEARCH_TYPE,
      rawExaResponse: content,
      citations: citations.slice(0, 3),
      intentId: opts.lookup.intentId,
      ok,
    });

    const evidence: SimpleEvidence = {
      id: newId("ev"),
      cap: "WEB",
      query: opts.lookup.q,
      title,
      url,
      content: content.slice(0, 6000),
      ok,
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
