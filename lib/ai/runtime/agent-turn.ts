/**
 * Agent turn — OpenAI-only chat path.
 * Local UI shortcuts and Gmail connector intents run before the OpenAI API.
 */

import { tryIntentShortcut } from "@/lib/ai/runtime/intent-actions";
import { clearTurnContext, setTurnContext } from "@/lib/ai/runtime/turn-context";
import type {
  AiGenerateRequest,
  AiGenerateResult,
} from "@/lib/ai/runtime/types";
import type { AiToolCallResult } from "@/lib/ai/runtime/tools";

export type AgentTurnResult = AiGenerateResult & {
  toolResults?: AiToolCallResult[];
  pausedForUser?: boolean;
  /** Answer text was already streamed via onProgress contentDelta. */
  presentationStreamed?: boolean;
};

/** Cursor-style live status while the agent thinks / calls tools. */
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
};

function detailForTool(name: string): string {
  switch (name) {
    case "project.create":
      return "Creating project…";
    case "project.open":
      return "Opening project…";
    case "workspace.search":
      return "Searching workspace…";
    case "knowledge.search":
      return "Searching knowledge…";
    case "web.search":
      return "Searching the web…";
    case "web.open":
      return "Opening page…";
    case "ui.ask_clarification":
      return "Preparing questions…";
    case "nav.open":
      return "Navigating…";
    case "panel.open":
    case "panel.close":
      return "Updating panel…";
    default:
      return "Calling tool…";
  }
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
    return await runAssistantTurnInner(request, opts);
  } finally {
    clearTurnContext();
  }
}

async function runAssistantTurnInner(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  const report = (progress: AgentTurnProgress) => {
    try {
      opts?.onProgress?.(progress);
    } catch {
      /* UI progress must never break the turn */
    }
  };

  const shortcut = await tryIntentShortcut(request.content, {
    threadId: request.threadId,
    recentText: (request.messages ?? [])
      .slice(-24)
      .map((m) => m.content)
      .join("\n"),
  });
  if (shortcut) {
    if (shortcut.toolResults?.length) {
      const first = shortcut.toolResults[0]!;
      report({
        phase: "tool",
        label: "Thinking",
        detail: detailForTool(first.name),
        toolName: first.name,
      });
    }
    return {
      content: shortcut.content,
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
      toolResults: shortcut.toolResults,
      pausedForUser: shortcut.pausedForUser,
    };
  }

  const { isCommsConnectorIntent } = await import("@/lib/ai/tools/domains");
  if (isCommsConnectorIntent(request.content)) {
    const { runCommsConnectorTurn } = await import(
      "@/lib/ai/connectors/comms-turn"
    );
    return runCommsConnectorTurn(request, opts);
  }

  const hasImages = Boolean(request.images?.length);
  if (!hasImages) {
    const { isSimpleConversational } = await import(
      "@/lib/ai/v6/surface/prepass"
    );
    if (isSimpleConversational(request.content)) {
      const text = request.content.trim();
      let content = "Happy to help — what would you like to know?";
      if (/thanks|thank you/i.test(text)) content = "You're welcome.";
      else if (/^(hi|hello|hey)\b/i.test(text)) content = "Hi — how can I help?";
      else if (/bye|good night/i.test(text)) content = "Goodbye.";
      report({
        phase: "generating",
        label: "Thinking",
        contentDelta: content,
        contentStreaming: true,
      });
      return {
        content,
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
      };
    }
  }

  report({ phase: "thinking", label: "Thinking" });
  const { runRawOpenAITurn } = await import("@/lib/ai/raw-openai/run-turn");
  return runRawOpenAITurn(request, opts);
}
