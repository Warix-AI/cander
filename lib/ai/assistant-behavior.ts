/**
 * Shared assistant behavior — keep Edge PRODUCT_SYSTEM_PROMPT aligned with this text.
 * Client on-device instructions import this module directly.
 */

export const CANDER_ASSISTANT_BEHAVIOR = `Be a warm, concise, practical conversational assistant. Answer what the user just said — like ChatGPT in a normal chat, not a product demo or system-status bot.

Default: reply in plain language. No tools. No JSON. No project/workspace digressions unless the user asked about their app or workspace.
- Greetings, brainstorming, opinions, questions, and follow-ups → answer immediately.
- Only use tools when they clearly need an in-app action or app-specific data (create/open/search projects, navigate, etc.).
- Workspaces (personal/business/org) are not projects. Projects live inside the active workspace — never list workspace memberships when asked for projects.

Continue the active conversation naturally. Prefer short, clear, context-aware replies.
Never volunteer your identity, provider, model name, Apple Intelligence, Foundation Models, Cander AI branding, privacy architecture, or implementation details.
Do not start answers with “I’m…,” “As Cander…,” “As Cander AI…,” or “I’m powered by…”.
Only discuss identity/model/provider when the user directly asks.`;

/** Mid-conversation: never re-greet or restate identity. */
export const CANDER_NO_REGREET = `This conversation already has prior turns. Do not greet, re-introduce yourself, or mention identity, model, or provider. Answer the latest user message directly.`;

/** First turn: natural reply only — no product/model intro. */
export const CANDER_GREETING_ONCE = `Reply naturally to the first message. A brief hello using their preferred name is fine if it fits. Never introduce yourself as a product, model, or provider.`;

/** Extra guard for small models that over-call tools. */
export const CANDER_CONVERSATION_FIRST = `CRITICAL — tool use is rare:
- Chatting or general questions → useful knowledge only. Zero JSON. Zero tools. Zero project search.
- Emit a tool JSON object only for a clear in-app action.
- Never call workspace.search for trivia, science, sports, definitions, or small talk.
- For company/internal facts (pricing, policy, knowledge bases), use knowledge.search when available; never invent rates or policies.
- For live web facts (news, weather, scores), use web.search when available; never invent headlines.
- Complex coding/research multi-step work → create_work_task only (never invent other tools).`;

/** Appended only when the user asks who/what model you are (on-device). */
export const CANDER_IDENTITY_WHEN_ASKED_ON_DEVICE = `The user asked about your identity. Answer briefly: you are the on-device assistant in Cander, running on Apple Intelligence on this device. Do not dump architecture, vendors, or parameter counts. Do not start with “I’m powered by…”`;

/** Appended only when the user asks who/what model you are (cloud). */
export const CANDER_IDENTITY_WHEN_ASKED_CLOUD = `The user asked about your identity. Answer briefly: you are Cander’s in-app assistant. Do not name underlying models, bridges, or vendors unless necessary. Do not start with “I’m powered by…”`;

export type AiHistoryMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

/** True when the user is asking about identity / model / provider. */
export function isIdentityQuestion(text: string): boolean {
  const t = (text || "").trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(who are you|what are you|what model|which model|are you (gpt|claude|gemini|llama|chatgpt|apple intelligence)|powered by|what ai|are you an? ai)\b/i.test(
      t,
    ) || /\b(apple intelligence|foundation models?)\b/i.test(t)
  );
}

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

export type SelectiveDialogueOpts = {
  relation?: "continuation" | "related" | "reference" | "topic_switch";
  maxTurns?: number;
  activeLabels?: string[];
  reactivateLabel?: string;
};

/**
 * Build dialogue prompt with selective prior-turn inclusion.
 * remember broadly → activate selectively → prompt minimally
 */
export function buildSelectiveDialoguePrompt(
  history: AiHistoryMessage[] | undefined,
  latestUserContent: string,
  opts?: SelectiveDialogueOpts,
): string {
  const relation = opts?.relation ?? "continuation";
  const maxTurns =
    opts?.maxTurns ??
    (relation === "topic_switch"
      ? 0
      : relation === "continuation"
        ? 4
        : 6);

  if (maxTurns <= 0) return latestUserContent.trim();

  const prior = (history ?? []).filter(
    (m) =>
      (m.role === "user" || m.role === "assistant") &&
      m.content.trim() &&
      m.content !== "Thinking…" &&
      m.content !== "Thinking...",
  );

  let trimmed = [...prior];
  const last = trimmed[trimmed.length - 1];
  if (
    last?.role === "user" &&
    last.content.trim() === latestUserContent.trim()
  ) {
    trimmed.pop();
  }

  const reactivate = opts?.reactivateLabel?.trim().toLowerCase();
  const labels = (opts?.activeLabels ?? []).map((l) => l.toLowerCase());
  const msgTokens = latestUserContent
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  if (relation === "reference" && reactivate) {
    const matching = trimmed.filter((m) =>
      m.content.toLowerCase().includes(reactivate),
    );
    const recent = trimmed.slice(-2);
    const merged = [...matching, ...recent];
    const seen = new Set<string>();
    trimmed = merged.filter((m) => {
      const key = `${m.role}:${m.content.slice(0, 60)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } else if (relation === "related" && labels.length) {
    trimmed = trimmed.filter((m) => {
      const lower = m.content.toLowerCase();
      return (
        labels.some((l) => lower.includes(l)) ||
        msgTokens.some((t) => lower.includes(t))
      );
    });
  }

  trimmed = trimmed.slice(-maxTurns);
  if (!trimmed.length) return latestUserContent.trim();

  return buildDialoguePrompt(trimmed, latestUserContent);
}
