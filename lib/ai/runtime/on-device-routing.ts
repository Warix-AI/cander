"use client";

import { liveInfoHint } from "../orchestrator/v2-helpers.ts";
import { classifyTaskType } from "../intelligence/classifier.ts";
import { getThreadTaskState } from "../task-state.ts";
import { resolveAllowedToolsForTurn } from "../tools/domains.ts";
import { isComplexWorkIntent } from "../tools/domains.ts";
import { getAiRuntimeMode } from "./mode-store.ts";
import { getFoundationModelsAvailability } from "./native/foundation-models.ts";
import type { AiGenerateRequest } from "./types.ts";

/** Pure routing logic — testable without native FM. */
export function preferOnDeviceForTurnContent(opts: {
  content: string;
  fmAvailable: boolean;
  threadId?: string | null;
  projectId?: string | null;
}): boolean {
  if (!opts.fmAvailable) return false;

  // Live / web retrieval always uses the cloud orchestrator (Brave on Edge),
  // same as desktop without a local FM helper — critical for iOS Auto + Apple Intelligence.
  if (liveInfoHint(opts.content)) return false;

  const taskState = getThreadTaskState(opts.threadId);
  const taskType = classifyTaskType({
    content: opts.content,
    taskState,
    projectId: opts.projectId,
  });

  if (
    taskType === "research" ||
    taskType === "execution" ||
    taskType === "release" ||
    taskType === "reasoning_heavy"
  ) {
    return false;
  }

  const gated = resolveAllowedToolsForTurn({
    content: opts.content,
    taskState,
  });
  if (gated.domains.includes("web") || gated.domains.includes("cloud_work")) {
    return false;
  }

  return taskType === "conversational" || taskType === "local_action";
}

/** Auto mode: use Foundation Models for simple on-device turns when ready. */
export async function shouldPreferOnDeviceForTurn(
  request: AiGenerateRequest,
): Promise<boolean> {
  const avail = await getFoundationModelsAvailability();
  return preferOnDeviceForTurnContent({
    content: request.content,
    fmAvailable: avail.available,
    threadId: request.threadId,
    projectId: request.projectId,
  });
}

/**
 * Unified architecture: FM orchestrator on Apple devices for normal chat.
 * Cloud orchestrator handles images, Build/complex work, and Auto without FM.
 */
export async function shouldUseLocalTurnOrchestrator(
  request: AiGenerateRequest,
): Promise<boolean> {
  if (request.images?.length) return false;
  if (isComplexWorkIntent(request.content)) return false;

  const mode = getAiRuntimeMode();
  if (mode === "cloud") return false;

  const avail = await getFoundationModelsAvailability();
  if (!avail.available) return false;
  if (mode === "local") return true;

  const taskState = getThreadTaskState(request.threadId);
  const taskType = classifyTaskType({
    content: request.content,
    taskState,
    projectId: request.projectId,
  });
  if (
    taskType === "research" ||
    taskType === "execution" ||
    taskType === "release" ||
    taskType === "reasoning_heavy"
  ) {
    return false;
  }

  return true;
}
