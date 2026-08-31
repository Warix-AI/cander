/**
 * Authority scoring — deterministic source classes.
 */

export type SourceClass =
  | "official_primary"
  | "authoritative_registry"
  | "first_party_docs"
  | "major_secondary"
  | "general"
  | "weak_secondary"
  | "anonymous";

const CLASS_SCORE: Record<SourceClass, number> = {
  official_primary: 100,
  authoritative_registry: 90,
  first_party_docs: 80,
  major_secondary: 70,
  general: 50,
  weak_secondary: 30,
  anonymous: 10,
};

export function classifyAuthority(args: {
  url?: string;
  sourceType?: string;
  domainHint?: string;
}): { class: SourceClass; score: number } {
  const url = (args.url || "").toLowerCase();
  const host = url.replace(/^https?:\/\//, "").split("/")[0] || "";

  if (
    /\.gov\b|sec\.gov|fda\.gov|courtlistener/i.test(host) ||
    args.domainHint === "government"
  ) {
    return { class: "official_primary", score: CLASS_SCORE.official_primary };
  }
  if (
    /investor\.|ir\.|\/leadership|\/about\/company/i.test(url) ||
    args.domainHint === "official_company"
  ) {
    return { class: "official_primary", score: CLASS_SCORE.official_primary };
  }
  if (/nutrition|menu|mcdonalds|tacobell/i.test(host)) {
    return { class: "official_primary", score: CLASS_SCORE.official_primary };
  }
  if (args.sourceType === "knowledge_base") {
    return { class: "first_party_docs", score: CLASS_SCORE.first_party_docs };
  }
  if (/wikipedia|reuters|apnews|bloomberg|nytimes/i.test(host)) {
    return { class: "major_secondary", score: CLASS_SCORE.major_secondary };
  }
  if (!host) {
    return { class: "anonymous", score: CLASS_SCORE.anonymous };
  }
  return { class: "general", score: CLASS_SCORE.general };
}

export function authorityScore(url?: string, sourceType?: string): number {
  return classifyAuthority({ url, sourceType }).score;
}
