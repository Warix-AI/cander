"use client";

import {
  buildSelectiveDialoguePrompt,
  hasPriorConversationTurns,
  isIdentityQuestion,
} from "@/lib/ai/assistant-behavior";
import { classifyTurnRelation } from "@/lib/ai/turn-environment/turn-relation";
import { buildPlanCapabilityLine } from "@/lib/ai/plan-capability";
import { buildCanderOnDeviceInstructions } from "@/lib/ai/runtime/cander-on-device-instructions";
import {
  ensureOnDeviceIdentity,
  getOnDeviceWorkspaceSnapshot,
  refreshOnDeviceInventoryCache,
} from "@/lib/ai/runtime/on-device-workspace-cache";
import { formatToolsForPrompt } from "@/lib/ai/runtime/tools";
import {
  generateWithFoundationModels,
  getFoundationModelsAvailability,
  hasStructuredFoundationModelsBridge,
} from "@/lib/ai/runtime/native/foundation-models";
import { buildContextPackage } from "@/lib/ai/intelligence/context-budget";
import {
  formatTaskStateForPrompt,
  getThreadTaskState,
} from "@/lib/ai/task-state";
import { resolveAllowedToolsForTurn } from "@/lib/ai/tools/domains";
import {
  AiRuntimeError,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiRuntimeCapabilities,
  type AiRuntimeProvider,
} from "@/lib/ai/runtime/types";
import { getActorSnapshot } from "@/lib/session";
import { getMembersSnapshot } from "@/lib/workspace-policy";

/**
 * Apple on-device provider via Capacitor → Foundation Models.
 *
 * PRIVACY: Inference stays on-device. Do not call Edge/ai-chat from this path.
 * Never volunteer Apple / PCC / routing details unless the user asks.
 */
export function createAppleLocalProvider(): AiRuntimeProvider {
  return {
    id: "apple-local",

    async getCapabilities(): Promise<AiRuntimeCapabilities> {
      const avail = await getFoundationModelsAvailability();
      return {
        available: avail.available,
        runtime: "apple-local",
        local: true,
        private: true,
        offline: true,
        streaming: avail.streaming,
        tools: true,
        structuredOutput: hasStructuredFoundationModelsBridge(),
      };
    },

    async isAvailable() {
      const avail = await getFoundationModelsAvailability();
      return avail.available;
    },

    async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
      if (request.images?.length) {
        throw new AiRuntimeError(
          "vision_requires_cloud",
          "On-device Apple Intelligence can't view images yet. Switch to Auto or Cloud to analyze photos and screenshots.",
        );
      }
      const avail = await getFoundationModelsAvailability();
      if (!avail.available) {
        throw new AiRuntimeError(
          "local_unavailable",
          avail.message ||
            "On-device Apple AI is not available. LOCAL will not send this request to the cloud.",
        );
      }
      try {
        const [identity] = await Promise.all([
          ensureOnDeviceIdentity(),
          refreshOnDeviceInventoryCache(request.workspaceId),
        ]);
        const taskState = getThreadTaskState(request.threadId);
        const taskActive =
          Boolean(taskState) &&
          taskState!.status !== "idle" &&
          taskState!.status !== "completed";
        const priorTurns = hasPriorConversationTurns(request.messages, {
          taskActive,
        });
        const resolved =
          request.allowedToolNames !== undefined
            ? {
                toolNames: request.allowedToolNames,
                domains: [] as const,
              }
            : resolveAllowedToolsForTurn({
                content: request.content,
                taskState,
              });
        const enableTools =
          request.allowTools !== false && resolved.toolNames.length > 0;
        const route =
          request.preferredRoute === "pcc" ? "pcc" : "on_device";
        const snap = getOnDeviceWorkspaceSnapshot({
          workspaceId: request.workspaceId,
          projectId: request.projectId,
          projectSpace: request.projectSpace,
          aiChatId: request.aiChatId,
          threadId: request.threadId,
          currentContent: request.content,
        });
        const toolBlock = enableTools
          ? formatToolsForPrompt(resolved.toolNames)
          : formatToolsForPrompt([]);
        const actorId = getActorSnapshot();
        const member =
          getMembersSnapshot().find((m) => m.id === actorId) ??
          getMembersSnapshot()[0];
        const taskBlock = formatTaskStateForPrompt(taskState);
        const pkg = buildContextPackage({
          route,
          taskStateText: taskBlock,
          recentMessages: request.messages,
          inventoryText: snap.inventoryBlock ?? "",
          toolCatalog: toolBlock,
          allowTools: enableTools,
        });
        const includeInventory =
          Boolean(pkg.inventoryText) && (enableTools || taskActive);
        const instructions = [
          buildCanderOnDeviceInstructions({
            shortName: identity?.shortName ?? snap.shortName,
            fullName: identity?.fullName ?? snap.fullName,
            email: identity?.email ?? snap.email,
            workspaceName: snap.workspaceName,
            projectTitle: includeInventory ? snap.projectTitle : null,
            spaceLabel: includeInventory ? snap.spaceLabel : null,
            inventoryBlock: includeInventory ? pkg.inventoryText : null,
            transcriptBlock: priorTurns ? null : snap.transcriptBlock,
            planCapabilityLine: buildPlanCapabilityLine(member),
            hasPriorTurns: priorTurns,
            includeInventory,
            toolsEnabled: enableTools,
            identityAsked: isIdentityQuestion(request.content),
            userMessage: request.content,
          }),
          pkg.taskStateText,
          pkg.toolCatalog,
        ]
          .filter(Boolean)
          .join("\n\n");
        const relation = classifyTurnRelation({
          userMessage: request.content,
          previous: null,
        });
        const prompt = buildSelectiveDialoguePrompt(
          (pkg.messages.length ? pkg.messages : request.messages) as
            | Array<{ role: "user" | "assistant" | "system"; content: string }>
            | undefined,
          request.content,
          { relation: relation.relation },
        );
        const content = await generateWithFoundationModels(
          prompt,
          instructions,
        );
        return {
          content,
          runtime: "apple-local",
          offline: false,
          condensationOccurred: false,
          aiChatId: request.aiChatId ?? null,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "On-device generation failed.";
        throw new AiRuntimeError("generation_failed", message);
      }
    },
  };
}
