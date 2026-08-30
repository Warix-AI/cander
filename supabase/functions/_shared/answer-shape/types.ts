/**
 * Generic answer-shaping contract — dependency-free.
 * Importable from Deno Edge and Next. No query-specific templates.
 */

export type AnswerShapeKind =
  | "fact"
  | "list"
  | "calculation"
  | "comparison"
  | "explanation"
  | "recommendation"
  | "research";

export type AnswerShape = {
  kind: AnswerShapeKind;
  /** Soft target for answer length in sentences / bullets. */
  maxSentences: number;
  preferBullets: boolean;
  preferTable: boolean;
  allowHeadings: boolean;
  /** Max evidence items to keep for synthesis. */
  maxEvidenceItems: number;
  /** Max chars of evidence body for the model. */
  maxEvidenceChars: number;
  formatHint: string;
};

export type CompactEvidenceItem = {
  id: string;
  title: string;
  url?: string | null;
  domain?: string;
  /** Compressed, question-relevant excerpt only. */
  excerpt: string;
  kind?: string;
  authority: number;
};

export const ANSWER_SHAPE_BUDGETS = {
  /** On-device / small models — strict. */
  onDevice: {
    maxEvidenceItems: 5,
    maxEvidenceChars: 2200,
    maxExcerptChars: 280,
  },
  /** Cloud / larger context. */
  cloud: {
    maxEvidenceItems: 8,
    maxEvidenceChars: 5200,
    maxExcerptChars: 420,
  },
} as const;

export type EvidenceBudgetProfile = keyof typeof ANSWER_SHAPE_BUDGETS;
