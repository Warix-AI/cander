"use client";

import { liveInfoHint } from "../orchestrator/v2-helpers.ts";
import { classifyTaskType } from "../intelligence/classifier.ts";
import { getThreadTaskState } from "../task-state.ts";
import { resolveAllowedToolsForTurn } from "../tools/domains.ts";
import { isComplexWorkIntent } from "../tools/domains.ts";
import { getAiRuntimeMode } from "./mode-store.ts";
import { getFoundationModelsAvailability } from "./native/foundation-models.ts";
import type { AiGenerateRequest } from "./types.ts";
import { refersToActiveBrowserSurface } from "../../browser-context/routing.ts";

/** Pure routing logic — testable without native FM. */
export function preferOnDeviceForTurnContent(opts: {
  content: string;
  fmAvailable: boolean;
  threadId?: string | null;
  projectId?: string | null;
}): boolean {
  if (!opts.fmAvailable) return false;

  // Right-panel browser reads must stay on-device / client — Electron IPC.
  if (refersToActiveBrowserSurface(opts.content)) return true;

  // Live web retrieval stays on-device when FM is available: TurnProfile pre-runs
  // Exa via Edge tools, then FM synthesizes. Cloud only when FM unavailable.
  if (liveInfoHint(opts.content)) return true;

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
  // cloud_work stays off-device; simple web domains can use local FM + tools.
  if (gated.domains.includes("cloud_work")) {
    return false;
  }

  return taskType === "conversational" || taskType === "local_action" || gated.domains.includes("web");
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
 * Routine Build may stay local only when NEXT_PUBLIC_AI_BUILD_ORCHESTRATOR is on.
 */
export async function shouldUseLocalTurnOrchestrator(
  request: AiGenerateRequest,
): Promise<boolean> {
  if (request.images?.length) return false;

  const {
    isBuildLocalOrchestratorEnabled,
    isBuildOrchestratorEnabled,
  } = await import("../orchestrator/flags.ts");
  const { resolveBuildCapabilities } = await import("../build/capabilities.ts");

  const buildCaps =
    isBuildOrchestratorEnabled() && isBuildLocalOrchestratorEnabled()
      ? resolveBuildCapabilities({
          content: request.content,
          activeSpace: request.projectSpace,
          projectId: request.projectId,
          hasBuildSpec: Boolean(request.projectId),
        })
      : null;

  const routineBuildLocal =
    buildCaps?.requiresBuildCapabilities === true &&
    buildCaps.complexity === "routine";

  // Do not globally rewrite isComplexWorkIntent — only divert flagged routine Build.
  if (!routineBuildLocal && isComplexWorkIntent(request.content)) {
    return false;
  }

  const mode = getAiRuntimeMode();
  if (mode === "cloud") return false;

  // Active right-panel inspection requires client Electron/Capacitor tools.
  if (refersToActiveBrowserSurface(request.content)) {
    const avail = await getFoundationModelsAvailability();
    if (avail.available || mode === "local") return true;
    if (!avail.available) return false;
  }

  const avail = await getFoundationModelsAvailability();
  if (!avail.available) return false;
  if (mode === "local") return true;

  if (routineBuildLocal) return true;

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
