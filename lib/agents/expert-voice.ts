/**
 * Keep Expert ↔ Cander dialogue free of implementation meta-language.
 * Pure helpers — safe for node:test.
 */

const META_SENTENCE =
  /\b(apply my instructions?|according to my instructions?|my (?:private )?instructions?|tell cander to|as an expert\b|do not rescan|re-?scan the (?:whole )?inbox|use the runtime|hidden prompt|system prompt|as an? ai\b|i(?:'m| am) an? (?:ai|llm|model))\b/i;

/** Strip implementation meta-language from Expert replies before they are persisted. */
export function sanitizeExpertVisibleMessage(text: string): string {
  const raw = text.trim();
  if (!raw) return raw;
  const sentences = raw
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const kept = sentences.filter((s) => !META_SENTENCE.test(s));
  const cleaned = (kept.length ? kept : sentences).join(" ").trim();
  return cleaned
    .replace(/\b(?:please\s+)?tell cander to\s+/gi, "")
    .replace(/\bapply my instructions?[^.!?]*[.!?]?/gi, "")
    .trim();
}
