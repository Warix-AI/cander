/**
 * Web research contract + citation helpers.
 * Run: node --experimental-strip-types --test scripts/web-research.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  assertPublicHttpUrl,
  canonicalUrl,
  dedupeSources,
  isFreshnessQuery,
  isPrivateOrBlockedHost,
  makeWebSource,
  sanitizeHttpUrl,
  WEB_RESEARCH_LIMITS,
} from "../lib/ai/web-research/index.ts";
import {
  collectCitationsFromToolResults,
  normalizeMessageCitations,
} from "../lib/ai/orchestrator/collect-citations.ts";
import { validateCitations } from "../lib/ai/orchestrator/citations.ts";
import {
  initialDeterministicToolCalls,
  wantsDeepResearch,
} from "../lib/ai/orchestrator/deterministic-triggers.ts";
import { messageRowToMessage, messageToRow } from "../lib/supabase/chat-mapper.ts";

describe("web-research contract", () => {
  it("rejects private and non-http URLs", () => {
    assert.equal(sanitizeHttpUrl("ftp://example.com"), null);
    assert.equal(isPrivateOrBlockedHost("127.0.0.1"), true);
    assert.equal(isPrivateOrBlockedHost("10.0.0.2"), true);
    assert.equal(isPrivateOrBlockedHost("192.168.1.1"), true);
    assert.equal(isPrivateOrBlockedHost("example.com"), false);
    assert.throws(() => assertPublicHttpUrl("http://localhost/x"));
    assert.equal(assertPublicHttpUrl("https://example.com/a"), "https://example.com/a");
  });

  it("canonicalizes and dedupes sources", () => {
    const a = makeWebSource({
      id: "1",
      title: "A",
      url: "https://Example.com/path/?utm_source=x",
      sourceType: "search",
    });
    const b = makeWebSource({
      id: "2",
      title: "B",
      url: "https://example.com/path",
      sourceType: "page",
    });
    assert.ok(a && b);
    assert.equal(canonicalUrl(a.url), a.canonicalUrl);
    const deduped = dedupeSources([a, b]);
    assert.equal(deduped.length, 1);
  });

  it("detects freshness queries for short cache TTL", () => {
    assert.equal(isFreshnessQuery("latest news about AI"), true);
    assert.equal(isFreshnessQuery("company about page"), false);
  });

  it("exports hard limits", () => {
    assert.ok(WEB_RESEARCH_LIMITS.maxResultsPerRequest <= 8);
    assert.ok(WEB_RESEARCH_LIMITS.searchesPerUserPerMinute > 0);
  });

  it("makeWebSource rejects private hosts (no silent accept)", () => {
    assert.equal(
      makeWebSource({
        id: "x",
        title: "local",
        url: "http://127.0.0.1/secret",
        sourceType: "page",
      }),
      null,
    );
  });
});

describe("citations", () => {
  it("normalizeMessageCitations drops non-http and invents nothing", () => {
    const out = normalizeMessageCitations([
      { id: "1", title: "Ok", url: "https://a.com" },
      { id: "2", title: "Bad", url: "javascript:alert(1)" },
      { id: "3", title: "Dup", url: "https://a.com/" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.url, "https://a.com");
  });

  it("collectCitationsFromToolResults reads web tool data", () => {
    const cites = collectCitationsFromToolResults([
      {
        name: "web.search",
        ok: true,
        output: "ok",
        data: {
          results: [
            {
              title: "Example",
              url: "https://example.com",
              description: "Hi",
            },
          ],
        },
      },
    ]);
    assert.equal(cites.length, 1);
    assert.equal(cites[0]!.url, "https://example.com");
  });

  it("validateCitations strips fabricated URLs", () => {
    const { text, strippedUrls } = validateCitations({
      answer: "See https://evil.example/fake and https://real.com/ok",
      sources: [{ id: "1", title: "Real", url: "https://real.com/ok" }],
    });
    assert.ok(strippedUrls.some((u) => u.includes("evil")));
    assert.ok(text.includes("[source omitted]"));
    assert.ok(text.includes("https://real.com/ok"));
  });

  it("message mapper persists citations jsonb", () => {
    const msg = {
      id: "m1",
      role: "assistant" as const,
      content: "Hello",
      at: "now",
      citations: [
        {
          id: "s1",
          title: "Example",
          url: "https://example.com",
          retrievedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    const row = messageToRow(msg, "t1", "w1", 0);
    assert.equal(row.citations?.length, 1);
    const roundTrip = messageRowToMessage(row);
    assert.equal(roundTrip.citations?.[0]?.url, "https://example.com");
  });
});

describe("deterministic web routing", () => {
  it("queues web.read for explicit URLs", () => {
    const calls = initialDeterministicToolCalls(
      "Summarize https://example.com/docs",
    );
    assert.equal(calls[0]?.name, "web.read");
  });

  it("queues web.search for deep research intent while Deep flag is off", () => {
    assert.equal(wantsDeepResearch("Please deep research solar vs wind"), true);
    const calls = initialDeterministicToolCalls(
      "Please deep research solar vs wind costs",
    );
    assert.equal(calls[0]?.name, "web.search");
    assert.equal(calls[0]?.reason, "deep_research_intent_degraded_to_search");
  });

  it("does not invent tools for casual rewrite", () => {
    const calls = initialDeterministicToolCalls("Rewrite this paragraph more clearly.");
    assert.equal(calls.length, 0);
  });
});

describe("EXA_API_KEY never in client bundles", () => {
  it("no NEXT_PUBLIC_EXA and no EXA_API_KEY in client lib/components", () => {
    const roots = ["lib", "components", "desktop/src", "mobile"];
    const hits: string[] = [];
    function walk(dir: string) {
      let entries: string[] = [];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        if (
          name === "node_modules" ||
          name === ".next" ||
          name === "dist" ||
          name === "release"
        ) {
          continue;
        }
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(ts|tsx|js|jsx)$/.test(name)) continue;
        // Edge shared + web-research contract may mention the env name.
        if (p.includes("supabase/functions")) continue;
        if (p.includes("web-research-contract")) continue;
        if (p.includes("web-research/index")) continue;
        if (p.includes("scripts/")) continue;
        const text = readFileSync(p, "utf8");
        if (/NEXT_PUBLIC_EXA/.test(text)) hits.push(`${p}: NEXT_PUBLIC_EXA`);
        // Client code must not read Deno.env / process.env EXA_API_KEY
        if (/process\.env\.EXA_API_KEY|Deno\.env\.get\(["']EXA_API_KEY/.test(text)) {
          hits.push(`${p}: env read`);
        }
      }
    }
    for (const r of roots) walk(r);
    assert.deepEqual(hits, []);
  });
});
