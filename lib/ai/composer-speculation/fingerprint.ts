/**
 * Fingerprints + trigger helpers for composer speculation.
 */

export type SpeculationMeta = {
  threadId?: string | null;
  workspaceId?: string | null;
  connectionIds?: string[];
  attachmentCount?: number;
};

export function normalizeSpeculationText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function speculationWordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function looksLikeCompleteSentence(text: string): boolean {
  return /[.!?]["']?\s*$/.test(text.trim());
}

/** Simple stable fingerprint — not cryptographic.
 * threadId is omitted so new-chat drafts still match after Send assigns an id.
 */
export function speculationFingerprint(
  text: string,
  meta: SpeculationMeta = {},
): string {
  const norm = normalizeSpeculationText(text).toLowerCase();
  const connections = (meta.connectionIds ?? []).slice().sort().join(",");
  const payload = [
    norm,
    meta.workspaceId ?? "",
    connections,
    String(meta.attachmentCount ?? 0),
  ].join("|");
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fp_${(h >>> 0).toString(36)}_${norm.length}`;
}

export function shouldEvaluateSpeculation(text: string): boolean {
  const words = speculationWordCount(text);
  if (words >= 5) return true;
  if (words >= 3 && looksLikeCompleteSentence(text)) return true;
  return false;
}

/** After min content, fire more often: every new word past lastEvalWordCount. */
export function shouldEscalateSpeculation(opts: {
  text: string;
  lastEvalWordCount: number;
}): boolean {
  const words = speculationWordCount(opts.text);
  if (words < 5) return false;
  return words > opts.lastEvalWordCount;
}
