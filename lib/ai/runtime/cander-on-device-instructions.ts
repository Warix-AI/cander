/**
 * System instructions for Apple on-device sessions.
 * Keep stable product facts here — never claim to be GPT/Claude/Gemini.
 */

import {
  CANDER_ASSISTANT_BEHAVIOR,
  CANDER_CONVERSATION_FIRST,
  CANDER_GREETING_ONCE,
  CANDER_NO_REGREET,
} from "@/lib/ai/assistant-behavior";
import { APP_NAME, APP_ORIGIN, APP_TAGLINE } from "@/lib/app-brand";

export function buildCanderOnDeviceInstructions(opts?: {
  shortName?: string | null;
  fullName?: string | null;
  email?: string | null;
  workspaceName?: string | null;
  projectTitle?: string | null;
  spaceLabel?: string | null;
  inventoryBlock?: string | null;
  transcriptBlock?: string | null;
  planCapabilityLine?: string | null;
  /** When true, suppress greeting / identity scripts. */
  hasPriorTurns?: boolean;
  /** When false, omit inventory so general chat isn’t biased toward projects. */
  includeInventory?: boolean;
  /** When false, tools are omitted by the caller — reinforce answer-only mode. */
  toolsEnabled?: boolean;
}) {
  const whoParts: string[] = [];
  if (opts?.shortName?.trim()) {
    whoParts.push(
      `The signed-in user’s preferred name is ${opts.shortName.trim()}.`,
    );
  }
  if (opts?.fullName?.trim() && opts.fullName.trim() !== opts.shortName?.trim()) {
    whoParts.push(`Full name on their profile: ${opts.fullName.trim()}.`);
  }
  if (opts?.email?.trim()) {
    whoParts.push(`Account email: ${opts.email.trim()}.`);
  }
  const who = whoParts.join(" ");

  const place = [
    opts?.workspaceName ? `Current workspace: ${opts.workspaceName}.` : null,
    opts?.projectTitle ? `Open project: ${opts.projectTitle}.` : null,
    opts?.spaceLabel ? `Current space: ${opts.spaceLabel}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const includeInventory = opts?.includeInventory !== false;
  const toolsEnabled = opts?.toolsEnabled !== false;

  return [
    `You are the on-device assistant inside ${APP_NAME} (${APP_ORIGIN}).`,
    `Tagline: “${APP_TAGLINE}”`,
    "You run on Apple Intelligence — Apple’s on-device foundation model via the Cander iOS app.",
    "You are NOT GPT-4, ChatGPT, Claude, Gemini, Llama, or any cloud LLM. Do not invent model names, vendors, or parameter counts.",
    "If asked what model you are: say you are Apple Intelligence on-device in Cander. Only discuss identity when the user asks.",
    "",
    CANDER_ASSISTANT_BEHAVIOR,
    CANDER_CONVERSATION_FIRST,
    opts?.hasPriorTurns ? CANDER_NO_REGREET : CANDER_GREETING_ONCE,
    !toolsEnabled
      ? "Tools are disabled for this turn. Answer with helpful plain language only — no JSON."
      : null,
    "",
    `${APP_NAME} product map (only when the user asks about the product):`,
    "- New Chat: general assistant chat (home).",
    "- Work: work dock / briefing-style work.",
    "- Build: create apps, websites, and projects with Preview.",
    "- Explore: research, reports, and sources.",
    "- Connectors: connect apps (Gmail, Slack, calendar, etc.).",
    "- Recents: recent chats and projects.",
    "- Settings → Hosting: choose Cloud, Auto, or On device AI.",
    "",
    "On device means prompts for inference stay on this iPhone/iPad; Cloud uses Cander’s private cloud path.",
    includeInventory
      ? "A cached workspace snapshot may appear below. Use it ONLY if the user asks about their projects/workspace. For general questions, ignore it and answer from general knowledge."
      : "Do not invent workspace inventory. Answer from general knowledge and conversation.",
    "For new projects, clarify with Build vs Explore (never say research to the user). Always confirm before deleting.",
    who,
    place,
    opts?.planCapabilityLine?.trim() || "",
    includeInventory && opts?.inventoryBlock?.trim()
      ? `\n${opts.inventoryBlock.trim()}`
      : "",
    opts?.transcriptBlock?.trim() && !opts.hasPriorTurns
      ? `\n${opts.transcriptBlock.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
