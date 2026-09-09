"use client";

/**
 * Open / sync guided website setup ClarificationCard for site projects.
 */

import {
  getActiveClarification,
  openClarificationCard,
  patchClarificationAnswers,
} from "@/lib/ai/clarification/store";
import {
  WEBSITE_SETUP_QUESTIONS,
  WEBSITE_SETUP_RESUME_TOOL,
  countCompletedSetupSteps,
} from "@/lib/ai/build/website-setup-brief";
import { patchWebsiteSetupBrief } from "@/lib/api/website-setup-client";

export function openWebsiteSetupClarification(opts: {
  threadId: string;
  projectId: string;
  answers?: Record<string, unknown>;
}) {
  const existing = getActiveClarification(opts.threadId);
  if (
    existing?.resumeTool === WEBSITE_SETUP_RESUME_TOOL &&
    existing.status === "active"
  ) {
    if (opts.answers) {
      patchClarificationAnswers(opts.threadId, opts.answers);
    }
    return existing;
  }
  return openClarificationCard({
    threadId: opts.threadId,
    title: "Website setup",
    description:
      "Eight quick answers, then confirm — we’ll design and build your draft.",
    questions: WEBSITE_SETUP_QUESTIONS,
    resumeTool: WEBSITE_SETUP_RESUME_TOOL,
    resumeArguments: { projectId: opts.projectId },
  });
}

export async function persistWebsiteSetupProgress(opts: {
  projectId: string;
  workspaceId: string;
  answers: Record<string, unknown>;
  status?: "setup" | "building" | "ready" | "failed";
}) {
  const completedSteps = countCompletedSetupSteps(opts.answers);
  return patchWebsiteSetupBrief({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    patch: {
      answers: opts.answers,
      completedSteps,
      status: opts.status ?? "setup",
      init: true,
    },
  });
}
