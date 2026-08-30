/**
 * Lightweight research quality gate — decides whether to answer or investigate more.
 * Dependency-light for unit tests (no network).
 */

export type ResearchConfidence = "high" | "medium" | "low";

export type ResearchQualityGate = {
  evidenceSufficient: boolean;
  conflictingEvidence: boolean;
  /** null when the question does not require arithmetic. */
  calculationVerified: boolean | null;
  confidence: ResearchConfidence;
  needsMoreInvestigation: boolean;
  reason: string;
};

export type EvidenceSnippet = {
  id?: string;
  title?: string;
  url?: string | null;
  content: string;
  kind?: string;
};

const OFFICIAL_HINT =
  /\b(official|nutrition|menu|facts?|fda|\.gov|calories?|nutritionix|restaurant)\b/i;

/** Split multi-component factual asks (bowls, combos, “A + B + C”). */
export function extractFactualComponents(question: string): string[] {
  const q = question.trim();
  if (!q) return [];

  // "half rice, half chow mein, orange chicken"
  const afterColon = q.split(":").slice(1).join(":").trim();
  const blob = afterColon || q;

  // Prefer comma / "and" / "+" lists with ≥2 parts
  const parts = blob
    .split(/\s*(?:,|;|\+|\/|\band\b)\s*/i)
    .map((p) => p.replace(/\b(with|plus|including)\b/gi, "").trim())
    .filter((p) => p.length >= 3 && p.split(/\s+/).length <= 8);

  const cleaned = parts
    .map((p) =>
      p
        .replace(/^(a|an|the)\s+/i, "")
        .replace(/\?+$/, "")
        .trim(),
    )
    .filter(Boolean);

  if (cleaned.length >= 2) return cleaned.slice(0, 8);

  // "X with Y and Z"
  const withMatch = q.match(
    /\b(?:bowl|meal|combo|order|plate)\b[:\s]+(.+)$/i,
  );
  if (withMatch?.[1]) {
    return extractFactualComponents(`items: ${withMatch[1]}`);
  }
  return [];
}

export function questionNeedsArithmetic(question: string): boolean {
  return (
    /\b(total|sum|add(?:\s+up)?|altogether|combined|how many (calories|cal)|calorie\b)/i.test(
      question,
    ) || extractFactualComponents(question).length >= 2
  );
}

/** Pull calorie-like numbers from evidence text for a component label. */
export function extractNumericFacts(
  text: string,
  opts?: { unitHint?: RegExp },
): number[] {
  const unit = opts?.unitHint ?? /\b(cal(?:ories)?|kcal)\b/i;
  const out: number[] = [];
  const re =
    /(\d{2,5}(?:\.\d+)?)\s*(?:cal(?:ories)?|kcal)\b|\b(?:cal(?:ories)?|kcal)\s*[:=]?\s*(\d{2,5}(?:\.\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = Number.parseFloat(m[1] || m[2] || "");
    if (Number.isFinite(n) && n > 0 && n < 50_000) out.push(n);
  }
  // Fallback: bare numbers near unit words in the same sentence
  if (!out.length && unit.test(text)) {
    for (const n of text.match(/\b\d{2,4}\b/g) ?? []) {
      const v = Number.parseInt(n, 10);
      if (v >= 40 && v <= 2000) out.push(v);
    }
  }
  return out;
}

export type ComponentFact = {
  label: string;
  value: number | null;
  unit: string;
  sourceIds: string[];
  conflicting: boolean;
};

/**
 * Resolve each component against evidence; flag conflicts when sources disagree
 * by more than ~12% (or 40 absolute for calorie-scale values).
 */
export function resolveComponentFacts(opts: {
  components: string[];
  evidence: EvidenceSnippet[];
  unit?: string;
}): ComponentFact[] {
  const unit = opts.unit ?? "cal";
  return opts.components.map((label) => {
    const tokens = label
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2 && !/^(half|with|and|the|for)$/i.test(t));
    const hits: Array<{ value: number; id: string }> = [];
    for (const e of opts.evidence) {
      const blob = `${e.title ?? ""}\n${e.content}`;
      const sentences = blob.split(/(?<=[.!?\n])\s+/);
      for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        const matched =
          tokens.length === 0
            ? false
            : tokens.filter((t) => lower.includes(t)).length >=
              Math.max(1, Math.ceil(tokens.length * 0.5));
        if (!matched) continue;
        for (const value of extractNumericFacts(sentence)) {
          hits.push({ value, id: e.id ?? e.url ?? label });
        }
      }
    }
    if (!hits.length) {
      return {
        label,
        value: null,
        unit,
        sourceIds: [],
        conflicting: false,
      };
    }
    const values = hits.map((h) => h.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min;
    const conflicting =
      values.length >= 2 &&
      (spread > 40 || (min > 0 && spread / min > 0.12));
    // Prefer median of clustered values
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)]!;
    return {
      label,
      value: mid,
      unit,
      sourceIds: [...new Set(hits.map((h) => h.id))],
      conflicting,
    };
  });
}

export function sumVerifiedComponents(
  facts: ComponentFact[],
): { total: number; verified: boolean } | null {
  if (!facts.length || facts.some((f) => f.value == null)) return null;
  if (facts.some((f) => f.conflicting)) {
    return {
      total: facts.reduce((s, f) => s + (f.value ?? 0), 0),
      verified: false,
    };
  }
  const total = facts.reduce((s, f) => s + (f.value as number), 0);
  return { total, verified: true };
}

/** Format a clean factual breakdown (not food-specific). */
export function formatComponentBreakdown(opts: {
  leadLabel: string;
  facts: ComponentFact[];
  total: number;
  unit?: string;
}): string {
  const unit = opts.unit ?? "cal";
  const unitWord =
    unit === "cal" || unit === "kcal" ? "calories" : unit;
  const lines = [
    `About ${formatNumber(opts.total)} ${unitWord} total:`,
    "",
    ...opts.facts.map((f) => {
      const v = f.value != null ? formatNumber(f.value) : "?";
      const pretty = capitalize(f.label);
      return `• ${pretty}: ${v} ${unit}`;
    }),
    "",
    `**Total: ~${formatNumber(opts.total)} ${unitWord}**`,
  ];
  return lines.join("\n");
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function scoreOfficialBias(url?: string | null, title?: string): number {
  const blob = `${url ?? ""} ${title ?? ""}`;
  let score = 0;
  if (/\.gov\b/i.test(blob)) score += 3;
  if (OFFICIAL_HINT.test(blob)) score += 2;
  if (/\b(wiki|reddit|quora|yahoo|blog)\b/i.test(blob)) score -= 1;
  return score;
}

/**
 * Evaluate whether evidence is good enough to answer now.
 * Snippets alone are never sufficient for nontrivial factual asks.
 */
export function evaluateResearchQuality(opts: {
  question: string;
  evidence: EvidenceSnippet[];
  /** Prior gate when retrying after dissatisfaction. */
  deeper?: boolean;
}): ResearchQualityGate {
  const { question, evidence } = opts;
  const pages = evidence.filter(
    (e) =>
      (e.kind === "web_page" || e.kind === "browser" || e.kind === "knowledge") &&
      e.content.trim().length >= 40,
  );
  const snippets = evidence.filter(
    (e) =>
      (e.kind === "search_result" || e.kind === "web_search" || !e.kind) &&
      e.content.trim(),
  );
  const needsMath = questionNeedsArithmetic(question);
  const components = extractFactualComponents(question);

  if (!pages.length && !snippets.length) {
    return {
      evidenceSufficient: false,
      conflictingEvidence: false,
      calculationVerified: needsMath ? false : null,
      confidence: "low",
      needsMoreInvestigation: true,
      reason: "no_evidence",
    };
  }

  // One thin snippet is never enough for live facts.
  if (pages.length === 0 && snippets.length < 2) {
    return {
      evidenceSufficient: false,
      conflictingEvidence: false,
      calculationVerified: needsMath ? false : null,
      confidence: "low",
      needsMoreInvestigation: true,
      reason: "single_snippet_insufficient",
    };
  }

  if (pages.length === 0 && snippets.length >= 1) {
    return {
      evidenceSufficient: false,
      conflictingEvidence: false,
      calculationVerified: needsMath ? false : null,
      confidence: "low",
      needsMoreInvestigation: true,
      reason: "snippets_only",
    };
  }

  let conflictingEvidence = false;
  let calculationVerified: boolean | null = needsMath ? false : null;

  if (components.length >= 2) {
    const facts = resolveComponentFacts({
      components,
      evidence: [...pages, ...snippets],
    });
    conflictingEvidence = facts.some((f) => f.conflicting);
    const missing = facts.some((f) => f.value == null);
    const sum = sumVerifiedComponents(facts);
    if (missing) {
      return {
        evidenceSufficient: false,
        conflictingEvidence,
        calculationVerified: false,
        confidence: "low",
        needsMoreInvestigation: true,
        reason: "incomplete_component_values",
      };
    }
    if (conflictingEvidence) {
      return {
        evidenceSufficient: false,
        conflictingEvidence: true,
        calculationVerified: false,
        confidence: "low",
        needsMoreInvestigation: true,
        reason: "conflicting_component_values",
      };
    }
    calculationVerified = Boolean(sum?.verified);
  } else if (needsMath) {
    const nums = pages.flatMap((p) =>
      extractNumericFacts(`${p.title ?? ""} ${p.content}`),
    );
    calculationVerified = nums.length > 0;
    if (nums.length >= 2) {
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      if (max - min > 40 && min > 0 && (max - min) / min > 0.15) {
        conflictingEvidence = true;
      }
    }
  }

  if (conflictingEvidence) {
    return {
      evidenceSufficient: false,
      conflictingEvidence: true,
      calculationVerified,
      confidence: "low",
      needsMoreInvestigation: true,
      reason: "conflicting_evidence",
    };
  }

  const distinctHosts = new Set(
    [...pages, ...snippets]
      .map((e) => {
        try {
          return new URL(e.url ?? "").hostname.replace(/^www\./, "");
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );

  const hasOfficial = [...pages, ...snippets].some(
    (e) => scoreOfficialBias(e.url, e.title) >= 2,
  );

  // Prefer ≥2 pages (or 1 strong official page) before answering.
  const enoughPages =
    pages.length >= 2 || (pages.length >= 1 && hasOfficial && distinctHosts.size >= 1);

  if (!enoughPages && !opts.deeper) {
    return {
      evidenceSufficient: false,
      conflictingEvidence: false,
      calculationVerified,
      confidence: "medium",
      needsMoreInvestigation: true,
      reason: "need_more_pages",
    };
  }

  if (needsMath && calculationVerified === false) {
    return {
      evidenceSufficient: false,
      conflictingEvidence: false,
      calculationVerified: false,
      confidence: "medium",
      needsMoreInvestigation: true,
      reason: "calculation_unverified",
    };
  }

  const confidence: ResearchConfidence =
    pages.length >= 2 && (hasOfficial || distinctHosts.size >= 2)
      ? "high"
      : pages.length >= 1
        ? "medium"
        : "low";

  return {
    evidenceSufficient: confidence !== "low",
    conflictingEvidence: false,
    calculationVerified,
    confidence,
    needsMoreInvestigation: confidence === "low",
    reason: confidence === "high" ? "multi_source_ok" : "acceptable",
  };
}

/** Deeper search queries after dissatisfaction / weak first pass. */
export function deeperResearchQueries(
  question: string,
  priorQueries: string[] = [],
): string[] {
  const base = question.trim().slice(0, 160);
  const components = extractFactualComponents(question);
  const out: string[] = [];
  if (components.length >= 2) {
    for (const c of components.slice(0, 4)) {
      out.push(`${c} calories nutrition official`.slice(0, 180));
    }
  }
  out.push(`${base} official nutrition facts`.slice(0, 180));
  out.push(`${base} site:menu OR calories`.slice(0, 180));
  const seen = new Set(priorQueries.map((q) => q.toLowerCase()));
  return out.filter((q) => {
    const key = q.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

/**
 * Detect “that's incorrect / try again” style corrections that need
 * deeper retrieval — not a user hand-off to check the menu.
 */
export function isCorrectionRetry(message: string): boolean {
  const t = message.trim();
  if (!t) return false;
  if (/^(try again|retry|redo( it)?|again)[.!]?$/i.test(t)) return true;
  if (
    /\b(that'?s|that is|this is)\s+(incorrect|wrong|not right|inaccurate|false)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\b(incorrect|wrong)\b[\s\S]{0,40}\b(try again|retry)\b/i.test(t)) {
    return true;
  }
  if (/\b(not what I (meant|asked)|try again|look again|check again)\b/i.test(t)) {
    return true;
  }
  return false;
}
