/**
 * Parse Exa synthesized search output + grounding into WebEvidence extensions.
 */

import type { WebSource } from "./types.ts";
import {
  exaDirectAnswerText,
  exaGroundingConfidence,
  nextEscalationMode,
  type ExaRetrievalMode,
  type TurnRetrievalHints,
} from "./retrieval-policy.ts";
import { dedupeSources, makeWebSource } from "./types.ts";

export type ExaGroundingField = {
  field?: string;
  citations?: Array<{ url?: string; title?: string }>;
  confidence?: string;
};

export type ExaSynthesizedOutput = {
  content?: string | Record<string, unknown>;
  grounding?: ExaGroundingField[];
};

export type ExaSearchBundle = {
  provider: "exa";
  retrievalMode: ExaRetrievalMode;
  query: string;
  directAnswer: string;
  structuredAnswer?: Record<string, unknown> | null;
  grounding: ExaGroundingField[];
  groundingConfidence: "low" | "medium" | "high" | "none";
  supportingResults: WebSource[];
  requestId?: string;
  costDollars?: number;
  outputSchemaType: "text" | "object" | "none";
};

export function parseExaSynthesizedResponse(opts: {
  query: string;
  retrievalMode: ExaRetrievalMode;
  output?: ExaSynthesizedOutput | null;
  results?: Array<{
    title?: string;
    url?: string;
    id?: string;
    publishedDate?: string;
    highlights?: string[];
    summary?: string;
    text?: string;
  }>;
  outputSchemaType: "text" | "object" | "none";
  requestId?: string;
  costDollars?: number;
  retrievedAt: string;
}): ExaSearchBundle {
  const content = opts.output?.content;
  const directAnswer = exaDirectAnswerText(content);
  const structuredAnswer =
    content && typeof content === "object" ? content : null;
  const grounding = opts.output?.grounding ?? [];
  const groundingConfidence = exaGroundingConfidence(grounding);

  const supporting: WebSource[] = [];
  for (const g of grounding) {
    for (const cite of g.citations ?? []) {
      const url = String(cite.url ?? "").trim();
      if (!url) continue;
      const src = makeWebSource({
        id: `ground_${supporting.length + 1}`,
        title: String(cite.title ?? url).slice(0, 200),
        url,
        excerpt: "",
        sourceType: "search",
        retrievedAt: opts.retrievedAt,
      });
      if (src) supporting.push(src);
    }
  }

  for (const row of opts.results ?? []) {
    const excerpt =
      (Array.isArray(row.highlights) && row.highlights.length
        ? row.highlights.join(" … ")
        : null) ||
      row.summary ||
      "";
    const src = makeWebSource({
      id: String(row.id ?? row.url ?? `res_${supporting.length + 1}`),
      title: String(row.title ?? ""),
      url: String(row.url ?? ""),
      excerpt: excerpt.slice(0, 800),
      publishedAt: row.publishedDate ?? null,
      sourceType: "search",
      retrievedAt: opts.retrievedAt,
    });
    if (src) supporting.push(src);
  }

  return {
    provider: "exa",
    retrievalMode: opts.retrievalMode,
    query: opts.query,
    directAnswer,
    structuredAnswer,
    grounding,
    groundingConfidence,
    supportingResults: dedupeSources(supporting),
    requestId: opts.requestId,
    costDollars: opts.costDollars,
    outputSchemaType: opts.outputSchemaType,
  };
}

export function exaBundleQualityOk(bundle: ExaSearchBundle): boolean {
  if (!bundle.directAnswer || bundle.directAnswer.length < 8) return false;
  if (bundle.groundingConfidence === "low") return false;
  return true;
}

export type ExaSynthesisQuality = {
  sufficient: boolean;
  escalateTo: ExaRetrievalMode | null;
  issues: string[];
};

export function evaluateExaSynthesisQuality(opts: {
  bundle: ExaSearchBundle;
  question: string;
  hints?: TurnRetrievalHints;
}): ExaSynthesisQuality {
  const issues: string[] = [];
  const { bundle, hints } = opts;
  const answer = bundle.directAnswer.toLowerCase();

  if (!bundle.directAnswer || bundle.directAnswer.length < 8) {
    issues.push("missing_direct_output");
  }
  if (bundle.groundingConfidence === "low" || bundle.groundingConfidence === "none") {
    issues.push("weak_grounding");
  }

  for (const field of hints?.requestedFields ?? []) {
    if (field === "date" && !/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/\d{1,2}|\d{4})\b/i.test(answer)) {
      issues.push("missing_field:date");
    }
    if (field === "time" && !/\b(\d{1,2}(:\d{2})?\s*(am|pm)|am|pm|o'clock|\d{1,2}:\d{2})\b/i.test(answer)) {
      issues.push("missing_field:time");
    }
    if (field === "location" && !/\b(at|in|provo|stadium|venue|home|away|city)\b/i.test(answer)) {
      issues.push("missing_field:location");
    }
  }

  if (hints?.operation === "list" && hints.requestedItemCount != null) {
    const itemMatches = bundle.directAnswer.match(/^\s*[-•*\d]/gm) ?? [];
    if (itemMatches.length < Math.min(hints.requestedItemCount, 2)) {
      issues.push("incomplete_list");
    }
  }

  if (/\b(insufficient|conflict|unclear|cannot determine|not enough)\b/i.test(bundle.directAnswer)) {
    issues.push("exa_reported_insufficient");
  }

  const sufficient =
    issues.length === 0 ||
    (issues.length === 1 &&
      issues[0] === "weak_grounding" &&
      bundle.groundingConfidence === "medium");

  let escalateTo: ExaRetrievalMode | null = null;
  if (!sufficient) {
    if (bundle.retrievalMode === "deep-reasoning") {
      escalateTo = null;
    } else {
      escalateTo = nextEscalationMode(bundle.retrievalMode);
    }
  }

  return { sufficient, escalateTo, issues };
}
