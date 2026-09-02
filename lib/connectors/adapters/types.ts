/**
 * Connector adapter interface — maps Cander tools ↔ provider payloads.
 */

import type { ToolExecutionResult, ToolReference } from "../../ai/tools/types.ts";

export type ConnectorAdapter = {
  connectorId: string;
  mapArguments(
    toolId: string,
    args: Record<string, unknown>,
  ): Record<string, unknown>;
  providerSlug(toolId: string): string;
  normalizeResult(input: {
    toolId: string;
    toolCallId: string;
    idempotencyKey: string;
    connectionId: string;
    raw: unknown;
  }): ToolExecutionResult;
};

export function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function unwrapProviderData(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  if (obj.data != null) return obj.data;
  if (obj.response_data != null) return obj.response_data;
  return raw;
}

export function buildDeniedResult(input: {
  toolId: string;
  toolCallId: string;
  idempotencyKey: string;
  connectionId?: string;
  code: string;
  message: string;
}): ToolExecutionResult {
  return {
    status: "denied",
    toolId: input.toolId,
    connectionId: input.connectionId,
    toolCallId: input.toolCallId,
    idempotencyKey: input.idempotencyKey,
    error: { code: input.code, message: input.message },
  };
}

export function buildErrorResult(input: {
  toolId: string;
  toolCallId: string;
  idempotencyKey: string;
  connectionId?: string;
  code: string;
  message: string;
}): ToolExecutionResult {
  return {
    status: "error",
    toolId: input.toolId,
    connectionId: input.connectionId,
    toolCallId: input.toolCallId,
    idempotencyKey: input.idempotencyKey,
    error: { code: input.code, message: input.message },
  };
}

export function buildSuccessResult(input: {
  toolId: string;
  toolCallId: string;
  idempotencyKey: string;
  connectionId: string;
  data: unknown;
  references?: ToolReference[];
}): ToolExecutionResult {
  return {
    status: "success",
    toolId: input.toolId,
    connectionId: input.connectionId,
    toolCallId: input.toolCallId,
    idempotencyKey: input.idempotencyKey,
    data: input.data,
    references: input.references,
  };
}
