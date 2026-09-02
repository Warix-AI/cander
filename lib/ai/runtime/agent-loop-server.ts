/**
 * Server-side agent loop — owns model rounds, discovery, auth, execution.
 * Client must not orchestrate rounds.
 */

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCapabilitySnapshot,
  formatCapabilitySnapshotForPrompt,
} from "@/lib/ai/runtime/capability-context";
import {
  discoverRelevantTools,
  resolveToolsForExposure,
} from "@/lib/ai/tools/discovery";
import { canderToolsToOpenAIFunctions, fromOpenAIToolName } from "@/lib/ai/tools/schemas";
import { getCanderTool, listCanderToolsForConnector } from "@/lib/ai/tools/cander-registry";
import type { CapabilitySnapshot, ToolExecutionResult } from "@/lib/ai/tools/types";
import { executeConnectorToolDetailed } from "@/lib/connectors/tool-execute";
import {
  loadRecentToolEvents,
  persistToolEvent,
  collectReferencesFromEvents,
} from "@/lib/ai/state/tool-events";
import { formatReferencesForPrompt } from "@/lib/ai/state/references";
import {
  isOpenAIWebSearchEnabled,
  resolveOpenAIModel,
} from "@/lib/ai/raw-openai/web-search";
import {
  detectImageGenerationIntent,
  isOpenAIImageGenerationEnabled,
  openAIImageGenerationTool,
} from "@/lib/ai/raw-openai/image-generation";
import { listActiveConnections } from "@/lib/connectors/connections";
import { authorizeToolExposure } from "@/lib/connectors/authorization";

const SYSTEM_BASE = `You are Cander, a concise and capable AI assistant. Answer the user's request directly.
Prefer compact, natural responses. Use connected app tools when needed via function calls.
Never claim an external action succeeded unless a tool returned success.
If a skill is disabled, tell the user to enable it in Connectors — do not invent workarounds.
Disabled write skills must never be treated as available.`;

export type AgentMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AgentLoopPause =
  | {
      type: "confirmation_required";
      toolId: string;
      preview?: Record<string, unknown>;
      message: string;
    }
  | {
      type: "skill_disabled";
      connectorId: string;
      skillId: string;
      message: string;
    }
  | {
      type: "account_ambiguous";
      connectorId: string;
      candidates: Array<{ connectionId: string; label: string }>;
      message: string;
    };

export type AgentLoopResult = {
  content: string;
  toolResults: ToolExecutionResult[];
  pause?: AgentLoopPause;
  turnId: string;
  model: string;
  discoveryReason?: string;
};

export type AgentLoopInput = {
  client: SupabaseClient;
  workspaceId: string;
  profileId: string;
  messages: AgentMessage[];
  threadId?: string | null;
  aiChatId?: string | null;
  /** User already confirmed a pending write. */
  confirmedToolCallId?: string | null;
  selectedConnectionId?: string | null;
  selectedConnectionIds?: string[] | null;
  maxIterations?: number;
};

function maxIterations(): number {
  const raw = Number(process.env.AI_AGENT_MAX_ITERATIONS ?? 6);
  return Number.isFinite(raw) ? Math.min(12, Math.max(1, raw)) : 6;
}

function extractOutputText(response: OpenAI.Responses.Response): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    };
    if (row.type === "message" && Array.isArray(row.content)) {
      for (const c of row.content) {
        if (c?.type === "output_text" && typeof c.text === "string") {
          parts.push(c.text);
        }
      }
    }
  }
  return parts.join("\n").trim();
}

type FunctionCallItem = {
  type: "function_call";
  call_id?: string;
  name?: string;
  arguments?: string;
  id?: string;
};

function extractFunctionCalls(
  output: OpenAI.Responses.Response["output"],
): FunctionCallItem[] {
  const calls: FunctionCallItem[] = [];
  for (const item of output ?? []) {
    if (!item || typeof item !== "object") continue;
    const row = item as FunctionCallItem;
    if (row.type === "function_call" && row.name) {
      calls.push(row);
    }
  }
  return calls;
}

function lastUserMessage(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return messages[i]!.content || "";
  }
  return "";
}

export async function runAgentServerLoop(
  input: AgentLoopInput,
): Promise<AgentLoopResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      content: "OPENAI_API_KEY is not configured on this server.",
      toolResults: [],
      turnId: crypto.randomUUID(),
      model: "none",
    };
  }

  const turnId = crypto.randomUUID();
  const model = resolveOpenAIModel();
  const openai = new OpenAI({ apiKey });

  // Server-derived capability snapshot — never trust client.
  const snapshot: CapabilitySnapshot = await getCapabilitySnapshot({
    client: input.client,
    workspaceId: input.workspaceId,
    profileId: input.profileId,
  });

  const chatId = input.aiChatId?.trim() || `thread:${input.threadId || turnId}`;
  const recentEvents = input.aiChatId
    ? await loadRecentToolEvents({
        client: input.client,
        chatId: input.aiChatId,
        ownerId: input.profileId,
        limit: 20,
      })
    : [];

  const connections = await listActiveConnections({
    client: input.client,
    workspaceId: input.workspaceId,
    profileId: input.profileId,
  });
  const connectionByConnector = new Map(
    (connections.ok ? connections.connections : []).map((c) => [
      c.connectorId,
      c,
    ]),
  );
  const scopedConnectionIds = [
    ...(input.selectedConnectionIds ?? []),
    ...(input.selectedConnectionId ? [input.selectedConnectionId] : []),
  ].filter((id, i, arr) => Boolean(id) && arr.indexOf(id) === i);

  const scopedConnections =
    connections.ok && scopedConnectionIds.length
      ? connections.connections.filter((c) =>
          scopedConnectionIds.includes(c.connectionId),
        )
      : [];
  const preferConnectorIds = scopedConnections.map((c) => c.connectorId);
  const scopedByConnector = new Map(
    scopedConnections.map((c) => [c.connectorId, c]),
  );

  const userMessage = lastUserMessage(input.messages);
  let discovery = discoverRelevantTools({
    userMessage,
    snapshot,
    recentEvents,
    preferConnectorIds,
  });
  let exposedIds = [...discovery.toolIds];

  // Filter to tools that pass exposure authz for at least one account
  exposedIds = exposedIds.filter((toolId) => {
    const tool = getCanderTool(toolId);
    if (!tool?.connectorId) return false;
    const conn =
      scopedByConnector.get(tool.connectorId) ??
      connectionByConnector.get(tool.connectorId);
    if (!conn) return false;
    const authz = authorizeToolExposure(toolId, {
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      connection: conn,
    });
    return authz.ok;
  });

  // If scoped but discovery empty, fall back to those connectors' registry tools.
  if (preferConnectorIds.length && !exposedIds.length) {
    for (const connectorId of preferConnectorIds) {
      for (const tool of listCanderToolsForConnector(connectorId)) {
        const conn =
          scopedByConnector.get(connectorId) ??
          connectionByConnector.get(connectorId);
        if (!conn) continue;
        const authz = authorizeToolExposure(tool.id, {
          workspaceId: input.workspaceId,
          profileId: input.profileId,
          connection: conn,
        });
        if (authz.ok) exposedIds.push(tool.id);
      }
    }
  }

  const refsPrompt = formatReferencesForPrompt(
    collectReferencesFromEvents(recentEvents),
  );
  const scopePrompt =
    scopedConnections.length > 0
      ? `User scoped this turn to: ${scopedConnections
          .map((c) => `${c.connectorId} (${c.connectionId})`)
          .join(", ")}. Prefer those connectors’ tools and do not ask which app to use unless the request clearly needs a different connected app.`
      : "";
  const system = [
    SYSTEM_BASE,
    formatCapabilitySnapshotForPrompt(snapshot),
    scopePrompt,
    refsPrompt,
  ]
    .filter(Boolean)
    .join("\n\n");

  type InputItem =
    | { role: "system" | "user" | "assistant"; content: string }
    | {
        type: "function_call";
        call_id: string;
        name: string;
        arguments: string;
      }
    | {
        type: "function_call_output";
        call_id: string;
        output: string;
      };

  const conversation: InputItem[] = [
    { role: "system", content: system },
    ...input.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const toolResults: ToolExecutionResult[] = [];
  const iterations = input.maxIterations ?? maxIterations();
  const webSearchEnabled = isOpenAIWebSearchEnabled();
  const imageGenEnabled = isOpenAIImageGenerationEnabled();
  const imageIntent = imageGenEnabled && detectImageGenerationIntent(userMessage);

  for (let round = 0; round < iterations; round++) {
    // Optional second discovery if first batch empty but connectors exist
    if (round > 0 && !exposedIds.length && snapshot.connectors.length) {
      discovery = discoverRelevantTools({
        userMessage,
        snapshot,
        recentEvents: [
          ...recentEvents,
          ...toolResults.map((r) => ({
            id: r.toolCallId,
            chatId,
            turnId,
            toolId: r.toolId,
            result: r,
            createdAt: new Date().toISOString(),
          })),
        ],
        alreadyExposed: exposedIds,
        preferConnectorIds,
      });
      for (const id of discovery.toolIds) {
        if (!exposedIds.includes(id)) exposedIds.push(id);
      }
    }

    const canderTools = resolveToolsForExposure(exposedIds);
    const functionTools = canderToolsToOpenAIFunctions(canderTools);
    const tools: OpenAI.Responses.Tool[] = [
      ...(functionTools as OpenAI.Responses.Tool[]),
      ...(webSearchEnabled && !imageIntent
        ? [{ type: "web_search" as const }]
        : []),
      ...(imageGenEnabled ? [openAIImageGenerationTool()] : []),
    ];


    let response: OpenAI.Responses.Response;
    response = await openai.responses.create({
      model,
      input: conversation as OpenAI.Responses.ResponseInput,
      ...(tools.length ? { tools } : {}),
      ...(imageIntent ? { tool_choice: { type: "image_generation" as const } } : {}),
    });

    const calls = extractFunctionCalls(response.output);
    const text = extractOutputText(response);

    if (!calls.length) {
      return {
        content: text || "Done.",
        toolResults,
        turnId,
        model,
        discoveryReason: discovery.reason,
      };
    }

    // Responses API requires the function_call items in input before any
    // function_call_output that references their call_id.
    for (const call of calls) {
      const callId = call.call_id || call.id;
      if (!callId || !call.name) continue;
      conversation.push({
        type: "function_call",
        call_id: callId,
        name: call.name,
        arguments: call.arguments || "{}",
      });
    }


    for (const call of calls) {
      const toolId = fromOpenAIToolName(call.name!);
      const callId = call.call_id || call.id;
      if (!callId) continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }


      const tool = getCanderTool(toolId);
      if (!tool?.connectorId) {
        conversation.push({
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify({
            status: "error",
            error: { code: "unknown_tool", message: `Unknown tool ${toolId}` },
          }),
        });
        continue;
      }

      const conn =
        scopedByConnector.get(tool.connectorId) ??
        (input.selectedConnectionId
          ? (connections.ok ? connections.connections : []).find(
              (c) => c.connectionId === input.selectedConnectionId,
            )
          : null) ??
        connectionByConnector.get(tool.connectorId);

      if (!conn) {
        conversation.push({
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify({
            status: "denied",
            error: {
              code: "not_connected",
              message: `Connect ${tool.connectorId} in Connectors first.`,
            },
          }),
        });
        continue;
      }

      const confirmed =
        Boolean(input.confirmedToolCallId) &&
        input.confirmedToolCallId === callId;

      const executed = await executeConnectorToolDetailed({
        client: input.client,
        workspaceId: input.workspaceId,
        profileId: input.profileId,
        tool: toolId,
        arguments: args,
        connectionId: conn.connectionId,
        toolCallId: callId,
        turnId,
        chatId: input.aiChatId,
        confirmed,
      });

      if (!executed.ok && executed.denial) {
        if (executed.denial.reason === "confirmation_required") {
          return {
            content: text || executed.denial.message,
            toolResults,
            pause: {
              type: "confirmation_required",
              toolId,
              preview: executed.denial.preview,
              message: executed.denial.message,
            },
            turnId,
            model,
            discoveryReason: discovery.reason,
          };
        }
        if (executed.denial.reason === "skill_disabled") {
          return {
            content: executed.denial.message,
            toolResults,
            pause: {
              type: "skill_disabled",
              connectorId: tool.connectorId,
              skillId: toolId,
              message: executed.denial.message,
            },
            turnId,
            model,
            discoveryReason: discovery.reason,
          };
        }
        if (executed.denial.reason === "account_ambiguous") {
          return {
            content: executed.denial.message,
            toolResults,
            pause: {
              type: "account_ambiguous",
              connectorId: tool.connectorId,
              candidates: executed.denial.candidates ?? [],
              message: executed.denial.message,
            },
            turnId,
            model,
            discoveryReason: discovery.reason,
          };
        }
      }

      const result: ToolExecutionResult =
        executed.result ??
        ({
          status: executed.ok ? "success" : "error",
          toolId,
          connectionId: conn.connectionId,
          toolCallId: callId,
          idempotencyKey: callId,
          data: executed.ok
            ? (() => {
                try {
                  return JSON.parse(executed.output);
                } catch {
                  return { output: executed.output };
                }
              })()
            : undefined,
          error: executed.ok
            ? undefined
            : { code: "execute_failed", message: executed.error },
        } as ToolExecutionResult);

      toolResults.push(result);

      if (input.aiChatId) {
        await persistToolEvent({
          client: input.client,
          chatId: input.aiChatId,
          ownerId: input.profileId,
          turnId,
          result,
        });
      }

      conversation.push({
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify({
          status: result.status,
          toolId: result.toolId,
          data: result.data,
          references: result.references,
          error: result.error,
        }),
      });
    }
  }

  // Final synthesis if we exhausted iterations with tool results
  const final = await openai.responses.create({
    model,
    input: [
      ...conversation,
      {
        role: "user",
        content:
          "Summarize the tool results for the user in plain language. Only claim side effects that succeeded.",
      },
    ] as OpenAI.Responses.ResponseInput,
  });

  return {
    content: extractOutputText(final) || "Done.",
    toolResults,
    turnId,
    model,
    discoveryReason: discovery.reason,
  };
}

export function isAgentRuntimeV2Enabled(): boolean {
  const v = process.env.AI_AGENT_RUNTIME?.trim().toLowerCase();
  // Default ON. Opt out with AI_AGENT_RUNTIME=legacy|off|0|false.
  if (!v) return true;
  if (v === "legacy" || v === "off" || v === "0" || v === "false" || v === "v1") {
    return false;
  }
  return v === "v2" || v === "1" || v === "true" || v === "on";
}
