/**
 * Client-side Exa synthesized search bundle (mirrors Edge contract).
 */

export type ExaGroundingField = {
  field?: string;
  citations?: Array<{ url?: string; title?: string }>;
  confidence?: string;
};

export type ExaSearchBundle = {
  provider: "exa";
  retrievalMode?: string | null;
  query: string;
  directAnswer: string;
  structuredAnswer?: Record<string, unknown> | null;
  grounding: ExaGroundingField[];
  groundingConfidence: "low" | "medium" | "high" | "none";
  outputSchemaType?: "text" | "object" | "none";
};

export function parseExaSearchBundle(raw: unknown): ExaSearchBundle | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const directAnswer = String(row.directAnswer ?? "").trim();
  if (!directAnswer) return null;
  const grounding = Array.isArray(row.grounding)
    ? (row.grounding as ExaGroundingField[])
    : [];
  const conf = String(row.groundingConfidence ?? "none").toLowerCase();
  const groundingConfidence =
    conf === "high" || conf === "medium" || conf === "low" ? conf : "none";
  return {
    provider: "exa",
    retrievalMode:
      typeof row.retrievalMode === "string" ? row.retrievalMode : null,
    query: String(row.query ?? ""),
    directAnswer,
    structuredAnswer:
      row.structuredAnswer && typeof row.structuredAnswer === "object"
        ? (row.structuredAnswer as Record<string, unknown>)
        : null,
    grounding,
    groundingConfidence,
    outputSchemaType:
      row.outputSchemaType === "object" || row.outputSchemaType === "text"
        ? row.outputSchemaType
        : "text",
  };
}

export function exaBundleUsable(bundle: ExaSearchBundle): boolean {
  if (!bundle.directAnswer || bundle.directAnswer.length < 8) return false;
  if (bundle.groundingConfidence === "low") return false;
  return true;
}
