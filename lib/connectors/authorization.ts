/**
 * Central connector authorization — expose + execute + confirmation gates.
 * Never trusts client-provided capability state.
 */

import {
  getCanderTool,
  connectorIdFromToolId,
} from "../ai/tools/cander-registry.ts";
import type {
  AuthzDenial,
  AuthzResult,
  CanderTool,
} from "../ai/tools/types.ts";
import { resolveToolPermissions, toolDefinition } from "./tool-catalog.ts";
import type { ResolvedConnection } from "./connections.ts";

export type AuthzContext = {
  workspaceId: string;
  profileId: string;
  connection?: ResolvedConnection | null;
  /**
   * Trusted server-side confirmation only (e.g. agent loop after matching
   * confirmedToolCallId). Never accept this from untrusted HTTP bodies.
   */
  confirmed?: boolean;
  /** Args for ambiguity checks (e.g. missing recipient). */
  arguments?: Record<string, unknown>;
};

/** Whether this tool may appear in the model's tool list. */
export function authorizeToolExposure(
  toolId: string,
  ctx: AuthzContext,
): AuthzResult | { ok: true; tool: CanderTool } {
  const tool = getCanderTool(toolId);
  if (!tool?.connectorId) {
    return {
      ok: false,
      reason: "not_allowed",
      skillId: toolId,
      message: "Unknown tool.",
    };
  }

  if (!ctx.connection) {
    return {
      ok: false,
      reason: "not_connected",
      connectorId: tool.connectorId,
      skillId: toolId,
      message: `Connect ${tool.connectorId} in Connectors first.`,
    };
  }

  if (ctx.connection.connectorId !== tool.connectorId) {
    return {
      ok: false,
      reason: "not_allowed",
      connectorId: tool.connectorId,
      skillId: toolId,
      message: "Connection does not match tool connector.",
    };
  }

  const permissions = resolveToolPermissions(
    tool.connectorId,
    ctx.connection.toolPermissions,
  );
  if (!permissions[toolId]) {
    return {
      ok: false,
      reason: "skill_disabled",
      connectorId: tool.connectorId,
      skillId: toolId,
      enableAction: { connectorId: tool.connectorId, skillId: toolId },
      message: `${tool.label} is disabled. Enable it in Connectors.`,
    };
  }

  return { ok: true, tool, connectionId: ctx.connection.connectionId };
}

/** Whether the runtime may execute this tool now. */
export function authorizeToolExecution(
  toolId: string,
  ctx: AuthzContext,
): AuthzResult {
  const exposure = authorizeToolExposure(toolId, ctx);
  if (!exposure.ok) return exposure;

  const tool = getCanderTool(toolId)!;
  const confirmation = evaluateConfirmationRequirement(tool, ctx);
  if (confirmation.required && !ctx.confirmed) {
    return {
      ok: false,
      reason: "confirmation_required",
      connectorId: tool.connectorId,
      skillId: toolId,
      preview: confirmation.preview,
      message: confirmation.message,
    };
  }

  return { ok: true, connectionId: ctx.connection!.connectionId };
}

export function evaluateConfirmationRequirement(
  tool: CanderTool,
  ctx: AuthzContext,
): { required: boolean; message: string; preview?: Record<string, unknown> } {
  if (tool.confirmationPolicy === "never") {
    return { required: false, message: "" };
  }
  if (tool.confirmationPolicy === "always") {
    return {
      required: true,
      message: `Confirm before running ${tool.label}.`,
      preview: {
        toolId: tool.id,
        arguments: ctx.arguments ?? {},
      },
    };
  }

  // when_ambiguous — require confirmation when key fields look incomplete
  const args = ctx.arguments ?? {};
  if (tool.id === "gmail.send") {
    const to = String(args.to ?? "").trim();
    const subject = String(args.subject ?? "").trim();
    const body = String(args.body ?? "").trim();
    if (!to || !subject || !body) {
      return {
        required: true,
        message: "Confirm recipient, subject, and body before sending.",
        preview: { toolId: tool.id, to, subject, body },
      };
    }
  }
  if (tool.id === "gmail.reply") {
    const threadId = String(args.threadId ?? "").trim();
    const body = String(args.body ?? "").trim();
    if (!threadId || !body) {
      return {
        required: true,
        message: "Confirm thread and reply body before sending.",
        preview: { toolId: tool.id, threadId, body },
      };
    }
  }
  if (tool.id === "slack.send") {
    const channel = String(args.channel ?? "").trim();
    const text = String(args.text ?? "").trim();
    if (!channel || !text) {
      return {
        required: true,
        message: "Confirm channel and message before posting.",
        preview: { toolId: tool.id, channel, text },
      };
    }
  }

  return { required: false, message: "" };
}

/** Legacy-compatible wrapper used by existing execute path. */
export function authorizeConnectorToolAction(input: {
  workspaceId: string;
  profileId: string;
  connectorId: string;
  toolName: string;
  toolPermissions?: Record<string, boolean> | null;
  connectionId?: string;
}):
  | { ok: true }
  | { ok: false; reason: "not_allowed" | "not_connected" | "connector_disabled" } {
  const definition = toolDefinition(input.toolName);
  if (!definition || definition.connectorId !== input.connectorId) {
    return { ok: false, reason: "not_allowed" };
  }

  // Allow any registered connector (no longer Gmail-only).
  if (!input.connectionId) {
    return { ok: false, reason: "not_connected" };
  }

  const permissions = resolveToolPermissions(
    input.connectorId,
    input.toolPermissions,
  );
  if (!permissions[input.toolName]) {
    return { ok: false, reason: "not_allowed" };
  }

  return { ok: true };
}

export function denialToHttpStatus(denial: AuthzDenial): number {
  switch (denial.reason) {
    case "not_connected":
      return 404;
    case "account_ambiguous":
      return 409;
    case "confirmation_required":
      return 428;
    case "rate_limited":
      return 429;
    default:
      return 403;
  }
}

export { connectorIdFromToolId };
