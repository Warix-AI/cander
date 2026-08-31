/**
 * Stage 6 — Semantic normalization (free-text property → canonical key).
 */

import type { NormalizedRequest, Request } from "../types.ts";

/** Deterministic aliases → canonical keys */
const ALIASES: Record<string, string> = {
  ceo: "company.current_ceo",
  "current ceo": "company.current_ceo",
  current_ceo: "company.current_ceo",
  "chief executive": "company.current_ceo",
  "chief executive officer": "company.current_ceo",
  "who runs the company": "company.current_ceo",
  "who runs apple": "company.current_ceo",
  "head of company": "company.current_ceo",
  "head of the company": "company.current_ceo",
  board_members: "company.board_members",
  "board members": "company.board_members",
  board: "company.board_members",
  current_share_price: "company.current_share_price",
  "share price": "company.current_share_price",
  "stock price": "company.current_share_price",
  calories: "nutrition.calories",
  calorie: "nutrition.calories",
  age: "person.age",
  "how old": "person.age",
  explanation: "concept.explanation",
  photosynthesis: "concept.photosynthesis",
  refund_policy: "policy.refund",
  "refund policy": "policy.refund",
  pto: "policy.pto",
  "pto policy": "policy.pto",
  date: "event.date",
  venue: "event.venue",
  where: "event.venue",
  when: "event.date",
  height: "geography.elevation",
  elevation: "geography.elevation",
  "how tall": "geography.elevation",
  weather: "weather.current",
  "current weather": "weather.current",
  temperature: "weather.current",
};

const ONTOLOGY: Array<{ pattern: RegExp; key: string }> = [
  {
    pattern: /\b(ceo|chief\s+executive|runs\s+(the\s+)?(company|apple|tesla)|who\s+runs)\b/i,
    key: "company.current_ceo",
  },
  { pattern: /\bboard\b/i, key: "company.board_members" },
  { pattern: /\b(share|stock)\s*price\b/i, key: "company.current_share_price" },
  { pattern: /\bcalories?\b/i, key: "nutrition.calories" },
  { pattern: /\bphotosynthesis\b/i, key: "concept.photosynthesis" },
  { pattern: /\brefund\b/i, key: "policy.refund" },
  { pattern: /\bpto\b/i, key: "policy.pto" },
  {
    pattern: /\b(everest|elevation|how\s+tall|height\s+of)\b/i,
    key: "geography.elevation",
  },
  { pattern: /\b(weather|forecast|temperature)\b/i, key: "weather.current" },
];

export function canonicalizeProperty(
  raw?: string,
): { canonicalKey?: string; status: "exact" | "mapped" | "unmatched" } {
  if (!raw?.trim()) return { status: "unmatched" };
  const key = raw.trim().toLowerCase();
  if (ALIASES[key]) {
    return {
      canonicalKey: ALIASES[key],
      status: key === ALIASES[key] ? "exact" : "mapped",
    };
  }
  // Already canonical
  if (/^(company|nutrition|person|concept|policy|event)\./.test(key)) {
    return { canonicalKey: key, status: "exact" };
  }
  for (const row of ONTOLOGY) {
    if (row.pattern.test(raw)) {
      return { canonicalKey: row.key, status: "mapped" };
    }
  }
  return { status: "unmatched" };
}

export function normalizeRequest(request: Request): NormalizedRequest {
  const prop = canonicalizeProperty(request.property);
  let subjectType: string | undefined;
  if (prop.canonicalKey?.startsWith("company.")) subjectType = "company";
  else if (prop.canonicalKey?.startsWith("person.")) subjectType = "person";
  else if (prop.canonicalKey?.startsWith("nutrition.")) subjectType = "food";
  else if (prop.canonicalKey?.startsWith("concept.")) subjectType = "concept";
  else if (prop.canonicalKey?.startsWith("policy.")) subjectType = "policy";
  else if (prop.canonicalKey?.startsWith("geography.")) subjectType = "place";
  else if (prop.canonicalKey?.startsWith("weather.")) subjectType = "weather";
  else if (prop.canonicalKey?.startsWith("event.")) subjectType = "event";

  return {
    request: {
      ...request,
      property: prop.canonicalKey || request.property,
    },
    subjectType,
    property: {
      raw: request.property,
      canonicalKey: prop.canonicalKey,
      status: prop.status,
    },
  };
}

export function normalizeRequests(requests: Request[]): NormalizedRequest[] {
  return requests.map(normalizeRequest);
}
