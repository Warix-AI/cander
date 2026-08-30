/**
 * Web retrieval orchestration tests.
 * Run: npm run test:orchestrator
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkWebEvidenceSufficiency,
  dedupeQueries,
  extractRequestedUrl,
  hydrateEvidenceFromSession,
  initTurnRetrieval,
  isSearchSessionFresh,
  rankSearchHits,
  refineSearchQueries,
  selectSourcesToOpen,
  shouldReuseSearchSession,
  simulateRetrievalLoop,
  urlHostMatchesDomain,
} from "../lib/ai/orchestrator/web-retrieval.ts";

describe("extractRequestedUrl", () => {
  it("detects View canderhq.com as exact domain request", () => {
    const r = extractRequestedUrl("View canderhq.com");
    assert.ok(r);
    assert.equal(r.domain, "canderhq.com");
    assert.equal(r.url, "https://canderhq.com");
    assert.equal(r.required, true);
  });

  it("detects full https URLs", () => {
    const r = extractRequestedUrl("Check https://canderhq.com/about");
    assert.ok(r);
    assert.equal(r.domain, "canderhq.com");
  });
});

describe("rankSearchHits", () => {
  it("prefers exact requested domain over similarly named companies", () => {
    const hits = rankSearchHits("View canderhq.com", [
      {
        title: "Cander Inc — enterprise software",
        url: "https://cander.io/",
        description: "Different company with similar name",
      },
      {
        title: "Cander HQ",
        url: "https://canderhq.com/",
        description: "Official homepage",
      },
      {
        title: "Cander Wikipedia",
        url: "https://en.wikipedia.org/wiki/Cander",
        description: "Aggregator",
      },
    ], { requestedDomain: "canderhq.com" });

    assert.equal(new URL(hits[0].url).hostname, "canderhq.com");
    assert.ok(hits[0].score > hits[1].score);
  });
});

describe("checkWebEvidenceSufficiency", () => {
  it("requires opening pages when only Brave snippets exist", () => {
    const retrieval = initTurnRetrieval("Who is the CEO of Acme Corp?");
    const r = checkWebEvidenceSufficiency({
      userRequest: "Who is the CEO of Acme Corp?",
      evidence: [
        {
          id: "s1",
          kind: "web_search",
          title: "Acme news",
          url: "https://example.com/acme",
          content: "Snippet about Acme",
          metadata: { discoveryOnly: true },
        },
      ],
      retrieval,
    });
    assert.equal(r.sufficient, false);
    assert.equal(r.reason, "snippets_only");
    assert.equal(r.needsOpen, true);
  });

  it("passes when web_page evidence is loaded", () => {
    const retrieval = initTurnRetrieval("Who is the CEO of Acme Corp?");
    const r = checkWebEvidenceSufficiency({
      userRequest: "Who is the CEO of Acme Corp?",
      evidence: [
        {
          id: "p1",
          kind: "web_page",
          title: "Acme leadership",
          url: "https://acme.com/team",
          content: "Jane Doe is CEO of Acme Corp, appointed 2024.",
        },
      ],
      retrieval,
    });
    assert.equal(r.sufficient, true);
  });

  it("flags conflicting sources for compare questions", () => {
    const retrieval = initTurnRetrieval("Which is better — A vs B?");
    const r = checkWebEvidenceSufficiency({
      userRequest: "Which is better — A vs B?",
      evidence: [
        { id: "s1", kind: "web_search", url: "https://a.com", content: "A" },
        { id: "s2", kind: "web_search", url: "https://b.com", content: "B" },
        { id: "s3", kind: "web_search", url: "https://c.com", content: "C" },
      ],
      retrieval,
    });
    assert.equal(r.sufficient, false);
    assert.equal(r.reason, "conflicting_sources");
    assert.equal(r.needsMoreSearch, true);
  });

  it("requires fresh evidence for current fact queries with no pages", () => {
    const retrieval = initTurnRetrieval("What's the latest news today?");
    const r = checkWebEvidenceSufficiency({
      userRequest: "What's the latest news today?",
      evidence: [],
      retrieval,
    });
    assert.equal(r.sufficient, false);
    assert.equal(r.needsMoreSearch, true);
  });

  it("reports exact URL unavailable when fetch failed", () => {
    const retrieval = initTurnRetrieval("View canderhq.com");
    retrieval.exactUrlFailed = true;
    retrieval.exactUrlRequired = true;
    retrieval.exactUrlDomain = "canderhq.com";
    const r = checkWebEvidenceSufficiency({
      userRequest: "View canderhq.com",
      evidence: [],
      retrieval,
    });
    assert.equal(r.sufficient, false);
    assert.equal(r.reason, "exact_url_unavailable");
  });
});

describe("dedupeQueries", () => {
  it("prevents duplicate searches within a turn", () => {
    const first = dedupeQueries(["acme ceo", "weather today"], []);
    assert.equal(first.queries.length, 2);
    const second = dedupeQueries(["acme ceo", "new query"], first.queries);
    assert.equal(second.queries.length, 1);
    assert.equal(second.queries[0], "new query");
    assert.equal(second.skipped.length, 1);
  });
});

describe("selectSourcesToOpen", () => {
  it("skips already opened URLs", () => {
    const ids = selectSourcesToOpen(
      "Acme CEO",
      [
        {
          id: "s1",
          kind: "web_search",
          url: "https://acme.com",
          content: "snippet",
          metadata: { rankScore: 1 },
        },
        {
          id: "s2",
          kind: "web_search",
          url: "https://news.com/acme",
          content: "snippet",
          metadata: { rankScore: 0.5 },
        },
      ],
      ["https://acme.com"],
      2,
    );
    assert.deepEqual(ids, ["s2"]);
  });
});

describe("search session reuse", () => {
  it("reuses fresh session on follow-up questions", () => {
    const session = {
      id: "sess_1",
      queries: ["Vercel sandbox program"],
      results: [
        {
          title: "Vercel Sandbox",
          url: "https://vercel.com/docs/sandbox",
          description: "Sandbox docs",
        },
      ],
      createdAt: new Date().toISOString(),
    };
    assert.equal(isSearchSessionFresh(session.createdAt), true);
    assert.equal(
      shouldReuseSearchSession({
        userRequest: "What does their sandbox program entail?",
        priorTopic: "Vercel sandbox program",
        session,
      }),
      true,
    );
    assert.equal(
      shouldReuseSearchSession({
        userRequest: "What's the latest news today?",
        priorTopic: "Vercel",
        session,
      }),
      false,
    );
  });

  it("hydrates ranked evidence from cached session", () => {
    const items = hydrateEvidenceFromSession(
      {
        id: "sess_abc",
        queries: ["canderhq"],
        results: [
          {
            title: "Cander HQ",
            url: "https://canderhq.com",
            description: "Homepage",
          },
        ],
        createdAt: new Date().toISOString(),
      },
      "tell me about canderhq",
      "canderhq.com",
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].metadata?.reusedSession, "sess_abc");
  });
});

describe("refineSearchQueries", () => {
  it("generates alternate queries after weak overlap", () => {
    const q = refineSearchQueries(
      "Acme Corp CEO",
      ["Acme Corp CEO"],
      "missing_entity_in_pages",
    );
    assert.ok(q.length >= 1);
    assert.ok(q.every((x) => x.toLowerCase() !== "acme corp ceo"));
  });
});

describe("simulateRetrievalLoop", () => {
  it("blocks answer when only snippets were collected", () => {
    const r = simulateRetrievalLoop([
      { action: "search", snippets: 5 },
      { action: "check" },
      { action: "answer" },
    ]);
    assert.equal(r.blockedOnSnippets, true);
    assert.equal(r.answered, false);
  });

  it("allows answer after search and open", () => {
    const r = simulateRetrievalLoop([
      { action: "search", snippets: 5 },
      { action: "open", pages: 2 },
      { action: "answer" },
    ]);
    assert.equal(r.answered, true);
    assert.equal(r.opens, 1);
  });
});

describe("urlHostMatchesDomain", () => {
  it("matches www subdomain to bare domain", () => {
    assert.equal(
      urlHostMatchesDomain("https://www.canderhq.com/about", "canderhq.com"),
      true,
    );
  });
});
