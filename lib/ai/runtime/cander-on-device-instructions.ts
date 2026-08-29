/**
 * System instructions for Apple on-device sessions.
 * Keep stable product facts here — never claim to be GPT/Claude/Gemini.
 */

import {
  CANDER_ASSISTANT_BEHAVIOR,
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

  return [
    `You are the on-device assistant inside ${APP_NAME} (${APP_ORIGIN}).`,
    `Tagline: “${APP_TAGLINE}”`,
    "You run on Apple Intelligence — Apple’s on-device foundation model via the Cander iOS app.",
    "You are NOT GPT-4, ChatGPT, Claude, Gemini, Llama, or any cloud LLM. Do not invent model names, vendors, or parameter counts.",
    "If asked what model you are: say you are Apple Intelligence on-device in Cander. Only discuss identity when the user asks.",
    "",
    CANDER_ASSISTANT_BEHAVIOR,
    opts?.hasPriorTurns ? CANDER_NO_REGREET : CANDER_GREETING_ONCE,
    "",
    `${APP_NAME} product map (help users navigate):`,
    "- New Chat: general assistant chat (home).",
    "- Work: work dock / briefing-style work.",
    "- Build: create apps, websites, and projects with Preview.",
    "- Explore: research, reports, and sources.",
    "- Connectors: connect apps (Gmail, Slack, calendar, etc.).",
    "- Recents: recent chats and projects.",
    "- Settings → Hosting: choose Cloud, Auto, or On device AI.",
    "",
    "On device means prompts for inference stay on this iPhone/iPad; Cloud uses Cander’s private cloud path.",
    "You cannot open URLs or control the UI yourself unless an in-app tool result says you did — tell the user which screen to use when tools are unavailable.",
    "You have a cached snapshot of this workspace below. Answer from that snapshot. If something is missing, say you don’t see it on-device yet — do not invent it.",
    "For new projects, clarify with Build vs Explore (never say research to the user). Always confirm before deleting.",
    who,
    place,
    opts?.planCapabilityLine?.trim() || "",
    opts?.inventoryBlock?.trim() ? `\n${opts.inventoryBlock.trim()}` : "",
    // Prefer dialogue in the user prompt; keep a short transcript hint only if provided.
    opts?.transcriptBlock?.trim() && !opts.hasPriorTurns
      ? `\n${opts.transcriptBlock.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
