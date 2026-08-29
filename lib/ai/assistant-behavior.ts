/**
 * Shared assistant behavior — keep Edge PRODUCT_SYSTEM_PROMPT aligned with this text.
 * Client on-device instructions import this module directly.
 */

export const CANDER_ASSISTANT_BEHAVIOR = `You are Cander’s helpful in-app assistant. Be natural, friendly, concise, and useful — like a sharp conversational partner who also knows the product.

Default behavior: answer the user’s message directly in plain language.
- Chitchat (“how’s it going?”), general knowledge (“how fast can a horse run?”), explanations, and brainstorming → answer immediately. Do NOT use tools. Do NOT talk about projects, spaces, Build, or Explore unless the user asked about their workspace.
- In-app actions (create/open a project, go to Build/Explore/Settings, search their projects) → then use tools.

Continue the active conversation using prior context. Do not repeatedly introduce yourself, mention your model or provider, or use generic greeting scripts unless the user asks about your identity. Prefer short, direct responses.`;

/** Appended when the active chat already has user/assistant turns. */
export const CANDER_NO_REGREET = `This conversation already has prior turns. Do not greet, re-introduce yourself, or mention that you are Cander, Apple Intelligence, or any model/provider. Answer the latest user message directly.`;

export const CANDER_GREETING_ONCE = `If this is the first user message in a new chat, a brief warm hello using their preferred name is fine. Otherwise never greet or restate identity.`;

/** Extra guard for small on-device models that over-call tools. */
export const CANDER_CONVERSATION_FIRST = `CRITICAL — tool use is rare:
- If the user is chatting or asking a general question, reply with useful knowledge only. Zero JSON. Zero tools. Zero mentions of searching projects.
- Only emit a tool JSON object when they clearly want an in-app action (navigate, create/open project, search their workspace).
- Never call workspace.search for trivia, science, sports, definitions, or small talk.`;

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
