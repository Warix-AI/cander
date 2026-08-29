/**
 * Shared assistant behavior — keep Edge PRODUCT_SYSTEM_PROMPT aligned with this text.
 * Client on-device instructions import this module directly.
 */

export const CANDER_ASSISTANT_BEHAVIOR = `You are Cander’s helpful in-app assistant. Be natural, friendly, concise, and useful. Continue the active conversation using its prior context. Do not repeatedly introduce yourself, mention your model or provider, or use generic greeting scripts unless the user directly asks about your identity. Ask focused follow-up questions only when information is genuinely needed. Prefer short, direct responses and take available in-app actions when appropriate.`;

/** Appended when the active chat already has user/assistant turns. */
export const CANDER_NO_REGREET = `This conversation already has prior turns. Do not greet, re-introduce yourself, or mention that you are Cander, Apple Intelligence, or any model/provider. Answer the latest user message directly.`;

export const CANDER_GREETING_ONCE = `If this is the first user message in a new chat, a brief warm hello using their preferred name is fine. Otherwise never greet or restate identity.`;

export type AiHistoryMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

/** True when prior turns mean we must suppress greeting scripts. */
export function hasPriorConversationTurns(
  messages: AiHistoryMessage[] | undefined | null,
  opts?: { condensedActive?: boolean; taskActive?: boolean },
): boolean {
  if (opts?.taskActive || opts?.condensedActive) return true;
  if (!messages?.length) return false;
  return messages.some(
    (m) =>
      (m.role === "user" || m.role === "assistant") &&
      Boolean(m.content?.trim()) &&
      m.content !== "Thinking…" &&
      m.content !== "Thinking...",
  );
}

/**
 * Cloud/Edge: suppress identity greetings when the chat is already underway
 * (more than the opening user turn, condensed memory, or an active task).
 */
export function shouldSuppressReGreeting(opts: {
  turns: Array<{ role: string; content?: string | null }>;
  condensedActive?: boolean;
  taskActive?: boolean;
}): boolean {
  if (opts.taskActive || opts.condensedActive) return true;
  const meaningful = opts.turns.filter(
    (m) =>
      (m.role === "user" || m.role === "assistant") &&
      Boolean(m.content?.trim()) &&
      m.content !== "Thinking…" &&
      m.content !== "Thinking...",
  );
  return meaningful.length > 1 || meaningful.some((m) => m.role === "assistant");
}

/**
 * Build an explicit dialogue prompt for providers that only accept a single user string
 * (e.g. Apple Foundation Models fresh sessions).
 */
export function buildDialoguePrompt(
  history: AiHistoryMessage[] | undefined,
  latestUserContent: string,
): string {
  const prior = (history ?? []).filter(
    (m) =>
      (m.role === "user" || m.role === "assistant") &&
      m.content.trim() &&
      m.content !== "Thinking…" &&
      m.content !== "Thinking...",
  );
  // Drop trailing duplicate of the current user turn if already in history.
  const trimmed = [...prior];
  const last = trimmed[trimmed.length - 1];
  if (
    last?.role === "user" &&
    last.content.trim() === latestUserContent.trim()
  ) {
    trimmed.pop();
  }
  if (!trimmed.length) return latestUserContent;

  const lines = [
    "Conversation so far:",
    ...trimmed.map((m) => {
      const label = m.role === "user" ? "User" : "Assistant";
      return `${label}: ${m.content.trim()}`;
    }),
    "",
    "Latest user message:",
    latestUserContent.trim(),
  ];
  return lines.join("\n");
}
