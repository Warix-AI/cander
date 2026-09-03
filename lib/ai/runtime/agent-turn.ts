/**
 * Chat turns — unified entry. Prefers agent v2 when server reports enabled.
 */

import { clearTurnContext, setTurnContext } from "@/lib/ai/runtime/turn-context";
import type {
  AiGenerateRequest,
  AiGenerateResult,
} from "@/lib/ai/runtime/types";
import type { AiToolCallResult } from "@/lib/ai/runtime/tools";
import type { LiveTurnLatencySession } from "../live-turn-latency.ts";

export type AgentTurnResult = AiGenerateResult & {
  toolResults?: AiToolCallResult[];
  pausedForUser?: boolean;
  presentationStreamed?: boolean;
};

export type AgentTurnProgress = {
  phase: "thinking" | "generating" | "tool" | "follow_up";
  label: string;
  detail?: string;
  toolName?: string;
  researchTasks?: Array<{
    id: string;
    label: string;
    status: "done" | "active" | "pending";
  }>;
  contentDelta?: string;
  contentStreaming?: boolean;
};

export type AgentTurnOptions = {
  onProgress?: (progress: AgentTurnProgress) => void;
  signal?: AbortSignal;
  /** Skip interim assistant text in onProgress (multi-step connector turns). */
  suppressContentDelta?: boolean;
  confirmedToolCallId?: string | null;
  selectedConnectionId?: string | null;
  selectedConnectionIds?: string[] | null;
  /** Phase 0 latency session — optional; never required for correctness. */
  latency?: LiveTurnLatencySession;
};

let agentV2EnabledCache: boolean | null = null;
let agentV2Probe: Promise<boolean> | null = null;

async function probeAgentRuntimeV2(): Promise<boolean> {
  if (agentV2EnabledCache != null) return agentV2EnabledCache;
  if (!agentV2Probe) {
    agentV2Probe = fetch("/api/ai/agent", { method: "GET" })
      .then(async (res) => {
        if (!res.ok) return false;
        const data = (await res.json().catch(() => ({}))) as {
          enabled?: boolean;
        };
        return Boolean(data.enabled);
      })
      .catch(() => false)
      .then((enabled) => {
        agentV2EnabledCache = enabled;
        agentV2Probe = null;
        return enabled;
      });
  }
  return agentV2Probe;
}

export async function runAssistantTurn(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  setTurnContext({
    threadId: request.threadId,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    userMessage: request.content,
  });
  try {
    opts?.onProgress?.({ phase: "thinking", label: "Thinking" });

    const latency = opts?.latency;
    latency?.mark("agent_probe_start");

    const { isRawOpenAIModeEnabled } = await import(
      "@/lib/ai/raw-openai/flags"
    );
    const connectorScoped = Boolean(
      opts?.selectedConnectionId ||
        (opts?.selectedConnectionIds && opts.selectedConnectionIds.length > 0),
    );
    // Default chat uses streamed raw OpenAI (ChatGPT-style tokens).
    // Connector-scoped turns still use the agent loop.
    const preferRawChat = isRawOpenAIModeEnabled() && !connectorScoped;

    const agentV2 = preferRawChat ? false : await probeAgentRuntimeV2();
    latency?.mark("agent_probe_end");
    latency?.setSignals({ agentV2 });

    if (agentV2) {
      latency?.setTransport("agent");
      const { runAgentClientTransport } = await import(
        "@/lib/ai/runtime/agent-client"
      );
      return runAgentClientTransport(request, opts);
    }

    // Legacy path until AI_AGENT_RUNTIME=v2 is enabled server-side.
    const { isCommsConnectorTurn } = await import(
      "@/lib/ai/connectors/comms-intent"
    );
    if (isCommsConnectorTurn(request.content, request.messages)) {
      latency?.setTransport("comms");
      const { runCommsConnectorTurn } = await import(
        "@/lib/ai/connectors/comms-turn"
      );
      return runCommsConnectorTurn(request, opts);
    }

    latency?.setTransport("raw");
    const { runRawOpenAITurn } = await import("@/lib/ai/raw-openai/run-turn");
    return runRawOpenAITurn(request, opts);
  } finally {
    clearTurnContext();
  }
}
