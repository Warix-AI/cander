/**
 * Client-delegation helpers for GPT-Live → Candor assistant.
 */

export type VoiceTranscriptEntry = {
  role: "user" | "assistant";
  text: string;
  at: number;
};

/** Keep recent turns for follow-ups without sending huge payloads. */
export function buildVoiceDelegationMessages(
  transcript: VoiceTranscriptEntry[],
  opts?: { maxEntries?: number; maxChars?: number },
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  const maxEntries = opts?.maxEntries ?? 16;
  const maxChars = opts?.maxChars ?? 6_000;
  const recent = transcript.slice(-maxEntries);
  const messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }> = [];
  let total = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const entry = recent[i]!;
    const content = entry.text.trim();
    if (!content) continue;
    if (total + content.length > maxChars && messages.length > 0) break;
    messages.unshift({ role: entry.role, content });
    total += content.length;
  }
  return messages;
}

/** Prefer the latest user utterance as the delegated request. */
export function resolveDelegationRequest(
  transcript: VoiceTranscriptEntry[],
): string {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const entry = transcript[i]!;
    if (entry.role !== "user") continue;
    const text = entry.text.trim();
    if (text) return text;
  }
  return "";
}

/** Compress assistant output for spoken delivery. */
export function summarizeForVoiceSpeech(content: string): string {
  const cleaned = content
    .replace(/\*\*/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return "I couldn't complete that request.";
  }
  // Prefer first 1–2 sentences for speech.
  const parts = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length <= 2) return cleaned.slice(0, 500);
  return parts.slice(0, 2).join(" ").slice(0, 500);
}

export function voiceDelegationLog(
  stage: string,
  payload: Record<string, unknown>,
) {
  if (process.env.NODE_ENV === "production") return;
  console.info(`[voice-delegation] ${stage}`, payload);
}
