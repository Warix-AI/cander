/**
 * System instructions for Apple on-device sessions.
 * Never volunteer identity/provider/model — only when identityAsked.
 */

import {
  CANDER_ASSISTANT_BEHAVIOR,
  CANDER_CONVERSATION_FIRST,
  CANDER_GREETING_ONCE,
  CANDER_IDENTITY_WHEN_ASKED_ON_DEVICE,
  CANDER_NO_REGREET,
} from "@/lib/ai/assistant-behavior";
import { APP_NAME } from "@/lib/app-brand";
import {
  CANDER_PRODUCT_GUIDE,
  isCanderHelpQuestion,
} from "@/lib/cander-product-guide";

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
  /** User asked who/what model — append identity script only then. */
  identityAsked?: boolean;
  /** Latest user message — used to attach product help when relevant. */
  userMessage?: string | null;
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

  const includeInventory = opts?.includeInventory === true;
  const toolsEnabled = opts?.toolsEnabled === true;

  const place =
    includeInventory || toolsEnabled
      ? [
          opts?.workspaceName ? `Current workspace: ${opts.workspaceName}.` : null,
          opts?.projectTitle ? `Open project: ${opts.projectTitle}.` : null,
          opts?.spaceLabel ? `Current space: ${opts.spaceLabel}.` : null,
        ]
          .filter(Boolean)
          .join(" ")
      : "";

  const includeProductGuide =
    toolsEnabled ||
    Boolean(opts?.userMessage && isCanderHelpQuestion(opts.userMessage));

  return [
    CANDER_ASSISTANT_BEHAVIOR,
    CANDER_CONVERSATION_FIRST,
    opts?.hasPriorTurns ? CANDER_NO_REGREET : CANDER_GREETING_ONCE,
    opts?.identityAsked ? CANDER_IDENTITY_WHEN_ASKED_ON_DEVICE : null,
    !toolsEnabled
      ? "Tools are disabled for this turn. Answer with helpful plain language only — no JSON."
      : null,
    toolsEnabled
      ? [
          "",
          `${APP_NAME} tool navigation:`,
          "- nav.open targets: new_chat, work, build, research (Home), recents, connectors, settings.",
          "- panel.open / panel.close for the side panel.",
          "- project.create / project.open for Build and Home projects.",
          "Say Home to users, never research (Explore still maps to Home). Confirm before deleting.",
        ].join("\n")
      : null,
    includeProductGuide ? `\n${CANDER_PRODUCT_GUIDE}` : null,
    includeInventory
      ? "A cached workspace snapshot may appear below. Use it ONLY for this in-app request."
      : null,
    who,
    place,
    toolsEnabled ? opts?.planCapabilityLine?.trim() || "" : "",
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
