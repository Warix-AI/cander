/**
 * Web provider — Exa via web-search-client; stubs only when allowStub.
 */

import type { Evidence, NormalizedRequest, RequestResult } from "../../types.ts";
import { scoreEvidenceForRequest } from "../../verify/evidence.ts";

export type WebFetch = (query: string) => Promise<{
  text: string;
  title?: string;
  url?: string;
  authority?: number;
} | null>;

export type WebRead = (url: string) => Promise<{
  text: string;
  title?: string;
  url: string;
} | null>;

function stubWebAnswer(n: NormalizedRequest): {
  text: string;
  title: string;
  url: string;
  authority: number;
} | null {
  const key = n.property.canonicalKey || "";
  const subj =
    n.request.subject?.type === "named" ? n.request.subject.value : "";

  if (key === "company.current_ceo" || /ceo/i.test(n.property.raw || "")) {
    const name = /apple/i.test(subj)
      ? "Tim Cook"
      : /tesla/i.test(subj)
        ? "Elon Musk"
        : /polar/i.test(subj)
          ? "Polar CEO (stub)"
          : `${subj} CEO (web stub)`;
    return {
      text: name,
      title: `${subj} leadership`,
      url: `https://example.com/${encodeURIComponent(subj)}/leadership`,
      authority: 100,
    };
  }
  if (key === "company.current_share_price") {
    return {
      text: "248.50",
      title: `${subj} stock`,
      url: `https://example.com/quote/${encodeURIComponent(subj)}`,
      authority: 90,
    };
  }
  if (key === "company.board_members") {
    return {
      text: JSON.stringify(["Alice Board", "Bob Director", "Carol Member"]),
      title: `${subj} board`,
      url: `https://example.com/${encodeURIComponent(subj)}/board`,
      authority: 100,
    };
  }
  if (key === "person.age") {
    return {
      text: "55",
      title: `${subj} age`,
      url: `https://example.com/people/${encodeURIComponent(subj)}`,
      authority: 70,
    };
  }
  if (key === "nutrition.calories") {
    return {
      text: /sprite/i.test(subj)
        ? "210 calories for a medium McDonald's Sprite"
        : "150 calories per Taco Bell Spicy Potato Soft Taco",
      title: "Nutrition facts",
      url: "https://example.com/nutrition",
      authority: 100,
    };
  }
  if (key === "event.date" || key === "event.venue") {
    return {
      text:
        key === "event.date"
          ? "Saturday, September 12"
          : "LaVell Edwards Stadium",
      title: "Game info",
      url: "https://example.com/sports",
      authority: 80,
    };
  }
  if (key === "weather.current") {
    return {
      text: "72°F and sunny",
      title: "Weather",
      url: "https://example.com/weather",
      authority: 80,
    };
  }
  if (key === "policy.refund" && /amazon/i.test(subj)) {
    return {
      text: "Amazon generally allows returns within 30 days for most items.",
      title: "Amazon returns",
      url: "https://www.amazon.com/returns",
      authority: 100,
    };
  }
  return null;
}

function buildQuery(n: NormalizedRequest): string {
  const subject =
    n.request.subject?.type === "named" ? n.request.subject.value : "";
  const refined = n.request.qualifiers?.refinedQuery;
  if (typeof refined === "string" && refined.trim()) return refined.trim();
  return `${subject} ${n.property.canonicalKey || n.property.raw || ""}`.trim();
}

async function liveWebSearch(query: string): Promise<{
  text: string;
  title?: string;
  url?: string;
  authority?: number;
} | null> {
  try {
    const { searchWeb } = await import("@/lib/api/web-search-client");
    const res = await searchWeb(query, { retrievalMode: "deep" });
    if (!res.ok) return null;
    const synthesis = res.synthesis as
      | { answer?: string; text?: string }
      | null
      | undefined;
    if (synthesis?.answer || synthesis?.text) {
      const cites = res.citations || [];
      return {
        text: String(synthesis.answer || synthesis.text).slice(0, 4000),
        title: cites[0]?.title || "Web result",
        url: cites[0]?.url,
        authority: 80,
      };
    }
    if (res.results?.length) {
      const top = res.results[0]!;
      return {
        text: res.results
          .slice(0, 3)
          .map((r) => `${r.title}: ${r.description}`)
          .join("\n"),
        title: top.title,
        url: top.url,
        authority: 70,
      };
    }
    if (res.detail?.trim()) {
      return { text: res.detail.slice(0, 4000), authority: 50 };
    }
  } catch {
    /* offline / no auth */
  }
  return null;
}

export async function executeWeb(
  n: NormalizedRequest,
  opts?: {
    fetchWeb?: WebFetch;
    readUrl?: WebRead;
    url?: string;
    allowStub?: boolean;
  },
): Promise<{ result: RequestResult; evidence: Evidence[] }> {
  let got: {
    text: string;
    title?: string;
    url?: string;
    authority?: number;
  } | null = null;

  if (opts?.url && opts.readUrl) {
    got = await opts.readUrl(opts.url);
  } else if (opts?.fetchWeb) {
    got = await opts.fetchWeb(buildQuery(n));
  } else {
    got = await liveWebSearch(buildQuery(n));
  }

  if (!got && opts?.allowStub) {
    got = stubWebAnswer(n);
  }

  if (!got) {
    return {
      result: {
        requestId: n.request.id,
        status: "unresolved",
        evidenceIds: [],
        reason: "web_miss",
      },
      evidence: [],
    };
  }

  let value: unknown = got.text;
  if (
    n.property.canonicalKey === "company.board_members" ||
    /board/i.test(n.property.raw || "")
  ) {
    try {
      const parsed = JSON.parse(got.text);
      if (Array.isArray(parsed)) value = parsed;
    } catch {
      value = got.text.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
    }
  }
  if (n.property.canonicalKey === "company.current_share_price") {
    const num = Number(String(got.text).replace(/[^0-9.]/g, ""));
    if (!Number.isNaN(num)) value = num;
  }
  if (n.property.canonicalKey === "person.age") {
    const num = Number(String(got.text).replace(/[^0-9.]/g, ""));
    if (!Number.isNaN(num)) value = num;
  }

  const id = `ev_web_${n.request.id}`;
  const scores = scoreEvidenceForRequest({
    requestId: n.request.id,
    subjectMatch: 0.9,
    propertyMatch: 0.85,
    relevance: 0.9,
    url: got.url,
    sourceType: "web",
  });
  scores.authority = got.authority ?? scores.authority;

  return {
    result: {
      requestId: n.request.id,
      status: "verified",
      value,
      evidenceIds: [id],
    },
    evidence: [
      {
        id,
        sourceType: "web",
        value,
        excerpt: got.text,
        source: { title: got.title, url: got.url },
        observedAt: new Date().toISOString(),
        scores: { [n.request.id]: scores },
      },
    ],
  };
}
