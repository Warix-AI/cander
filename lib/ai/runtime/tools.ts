/**
 * Tool/MCP seam for AIRuntime — executes authorized in-app tools.
 */

import { getAppActionHandlers } from "@/lib/ai/runtime/app-actions";
import {
  getAiTool,
  listAiTools,
  resolveAuthorizedToolNames,
  validateToolArguments,
  type AiToolDefinition,
} from "@/lib/ai/tools/registry";
import type { ClarificationQuestion } from "@/lib/ai/clarification/schema";
import { parseToolCallFromContent } from "@/lib/ai/tool-protocol";

export type AiToolCallRequest = {
  name: string;
  arguments?: Record<string, unknown>;
};

export type AiToolCallResult = {
  name: string;
  ok: boolean;
  output: string;
  /** When true, the agent loop should pause for user UI (card/confirm). */
  pauseForUser?: boolean;
  data?: Record<string, unknown>;
};

export { parseToolCallFromContent };

export function listRuntimeTools(): AiToolDefinition[] {
  return listAiTools().filter((tool) => tool.enabled);
}

export function formatToolsForPrompt(): string {
  const tools = listRuntimeTools();
  if (!tools.length) return "";
  const lines = [
    "You can request in-app tools by ending your reply with a single JSON object on its own line:",
    '{"tool":"<name>","arguments":{...}}',
    "Only use tools when needed. Otherwise reply normally with no JSON tool line.",
    "Available tools:",
  ];
  for (const t of tools) {
    lines.push(
      `- ${t.name}: ${t.description} args=${JSON.stringify(t.parameters)}`,
    );
  }
  return lines.join("\n");
}

export async function executeAuthorizedTool(
  call: AiToolCallRequest,
): Promise<AiToolCallResult> {
  let tool: AiToolDefinition | null = null;
  try {
    const resolved = resolveAuthorizedToolNames([call.name]);
    tool = resolved[0] ?? getAiTool(call.name);
  } catch {
    tool = getAiTool(call.name);
  }
  if (!tool || !tool.enabled) {
    return {
      name: call.name,
      ok: false,
      output: `Tool unavailable: ${call.name}`,
    };
  }

  const validated = validateToolArguments(tool, call.arguments);
  if (!validated.ok) {
    return { name: tool.name, ok: false, output: validated.error };
  }
  const args = validated.args;
  const actions = getAppActionHandlers();
  if (!actions) {
    return {
      name: tool.name,
      ok: false,
      output: "App actions are not registered yet.",
    };
  }

  try {
    switch (tool.name) {
      case "nav.open": {
        const target = String(args.target);
        const mapped =
          target === "settings"
            ? ({
                kind: "settings" as const,
                tab: args.settingsTab
                  ? String(args.settingsTab)
                  : undefined,
              })
            : target === "recents" ||
                target === "connectors" ||
                target === "new_chat"
              ? { kind: target as "recents" | "connectors" | "new_chat" }
              : { kind: "space" as const, space: target };
        const result = actions.navOpen(mapped);
        return {
          name: tool.name,
          ok: result.ok,
          output: result.detail,
        };
      }
      case "panel.open": {
        const result = actions.panelOpen({
          projectId: args.projectId
            ? String(args.projectId)
            : undefined,
          mode: args.mode ? String(args.mode) : undefined,
        });
        return { name: tool.name, ok: result.ok, output: result.detail };
      }
      case "panel.close": {
        const result = actions.panelClose();
        return { name: tool.name, ok: result.ok, output: result.detail };
      }
      case "project.create": {
        const result = await actions.projectCreate({
          title: String(args.title),
          space: args.space ? String(args.space) : undefined,
          kind: args.kind ? String(args.kind) : undefined,
          summary: args.summary ? String(args.summary) : undefined,
        });
        return {
          name: tool.name,
          ok: result.ok,
          output: result.detail,
          data: result.projectId ? { projectId: result.projectId } : undefined,
        };
      }
      case "project.open": {
        const result = actions.projectOpen(String(args.projectId));
        return { name: tool.name, ok: result.ok, output: result.detail };
      }
      case "workspace.search": {
        const result = actions.workspaceSearch(String(args.query));
        return {
          name: tool.name,
          ok: result.ok,
          output: `${result.detail}\n${JSON.stringify(result.results)}`,
          data: { results: result.results },
        };
      }
      case "ui.ask_clarification": {
        const questions = Array.isArray(args.questions)
          ? (args.questions as ClarificationQuestion[])
          : [];
        const result = actions.askClarification({
          title: String(args.title),
          description: args.description
            ? String(args.description)
            : undefined,
          questions,
          resumeTool: args.resumeTool
            ? String(args.resumeTool)
            : undefined,
          resumeArguments:
            args.resumeArguments &&
            typeof args.resumeArguments === "object"
              ? (args.resumeArguments as Record<string, unknown>)
              : undefined,
        });
        return {
          name: tool.name,
          ok: result.ok,
          output: result.detail,
          pauseForUser: true,
        };
      }
      case "ui.confirm": {
        const result = actions.requestConfirm({
          title: String(args.title),
          message: String(args.message),
          confirmLabel: args.confirmLabel
            ? String(args.confirmLabel)
            : undefined,
        });
        return {
          name: tool.name,
          ok: result.ok,
          output: result.detail,
          pauseForUser: true,
          data: { confirmed: result.confirmed },
        };
      }
      default:
        return {
          name: tool.name,
          ok: false,
          output: `No executor for ${tool.name}`,
        };
    }
  } catch (err) {
    return {
      name: tool.name,
      ok: false,
      output: err instanceof Error ? err.message : "Tool failed",
    };
  }
}

export { resolveAuthorizedToolNames };
