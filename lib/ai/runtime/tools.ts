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
import { CANDER_NO_TOOLS_THIS_TURN, CANDER_TOOL_PROTOCOL_RULES } from "@/lib/ai/tools/prompt";
import {
  getTurnProjectId,
  getTurnThreadId,
  getTurnWorkspaceId,
} from "@/lib/ai/runtime/turn-context";
import { getThreadTaskState, upsertThreadTaskState } from "@/lib/ai/task-state";

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

/** Prompt catalog for this turn — empty toolNames means no tools. */
export function formatToolsForPrompt(toolNames?: string[]): string {
  if (toolNames && toolNames.length === 0) {
    return CANDER_NO_TOOLS_THIS_TURN;
  }
  const all = listRuntimeTools();
  const tools = toolNames?.length
    ? all.filter((t) => toolNames.includes(t.name))
    : all;
  if (!tools.length) return CANDER_NO_TOOLS_THIS_TURN;
  const lines = [CANDER_TOOL_PROTOCOL_RULES, "", "Available tools:"];
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
    // Clarification with bad/empty args should still pause, not dump errors as "continue"
    if (tool.name === "ui.ask_clarification") {
      return {
        name: tool.name,
        ok: false,
        output: validated.error,
        pauseForUser: true,
      };
    }
    return { name: tool.name, ok: false, output: validated.error };
  }
  const args = validated.args;

  // Work tasks do not need app action handlers.
  if (tool.name === "create_work_task") {
    const { authorizeToolCapability } = await import(
      "@/lib/ai/intelligence/capability-gateway"
    );
    const gate = authorizeToolCapability(tool.name);
    if (!gate.ok) {
      return { name: tool.name, ok: false, output: gate.reason };
    }
    const threadId = getTurnThreadId() ?? "";
    if (!threadId) {
      return {
        name: tool.name,
        ok: false,
        output: "No active chat for this work task.",
      };
    }
    const kindRaw = String(args.kind);
    const kind =
      kindRaw === "research" || kindRaw === "multi_step"
        ? kindRaw
        : "coding";
    const { createDurableAiTask, formatDurableTaskProgress } = await import(
      "@/lib/ai/intelligence/durable-tasks"
    );
    const task = await createDurableAiTask({
      threadId,
      workspaceId: getTurnWorkspaceId(),
      projectId: getTurnProjectId(),
      title: String(args.title),
      goal: String(args.goal),
      kind,
      summary: args.summary ? String(args.summary) : undefined,
    });
    upsertThreadTaskState(threadId, {
      goal: task.goal,
      step: "work_task_queued",
      status: "running",
      workTaskId: task.id,
      allowedDomains: ["cloud_work"],
      pendingClarification: null,
      facts: { workTaskKind: task.kind, workTaskTitle: task.title },
    });
    return {
      name: tool.name,
      ok: true,
      output: formatDurableTaskProgress(task),
      data: { workTaskId: task.id },
    };
  }

  if (tool.name === "check_work_task") {
    const { getDurableAiTask, formatDurableTaskProgress } = await import(
      "@/lib/ai/intelligence/durable-tasks"
    );
    const threadId = getTurnThreadId() ?? "";
    const id =
      (args.workTaskId ? String(args.workTaskId) : "") ||
      getThreadTaskState(threadId)?.workTaskId ||
      "";
    const task = await getDurableAiTask(id);
    if (!task) {
      return {
        name: tool.name,
        ok: false,
        output: "I couldn’t find that work item.",
      };
    }
    return {
      name: tool.name,
      ok: true,
      output: formatDurableTaskProgress(task),
      data: { workTaskId: task.id, status: task.status },
    };
  }

  if (tool.name === "request_publish_approval") {
    const actions = getAppActionHandlers();
    if (!actions) {
      return {
        name: tool.name,
        ok: false,
        output: "App actions are not registered yet.",
      };
    }
    const result = actions.requestConfirm({
      title: "Publish draft?",
      message:
        args.message
          ? String(args.message)
          : "Publishing promotes your draft. This only happens when you confirm.",
      confirmLabel: "Publish",
    });
    return {
      name: tool.name,
      ok: result.ok,
      output: result.detail,
      pauseForUser: true,
    };
  }

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
        const results = result.results ?? [];
        // Single strong match → open it
        if (results.length === 1) {
          const open = actions.projectOpen(results[0]!.id);
          return {
            name: "project.open",
            ok: open.ok,
            output: open.ok
              ? `Opened “${results[0]!.title}”.`
              : open.detail,
            data: { projectId: results[0]!.id, results },
          };
        }
        if (results.length > 1) {
          const clarify = actions.askClarification({
            title: "Which project?",
            description: "I found a few matches.",
            threadId: getTurnThreadId() ?? undefined,
            questions: [
              {
                id: "projectId",
                type: "single_choice",
                label: "Pick a project",
                required: true,
                choices: results.map((r) => ({
                  id: r.id,
                  label: r.space ? `${r.title} (${r.space})` : r.title,
                })),
              },
            ],
            resumeTool: "project.open",
          });
          return {
            name: "ui.ask_clarification",
            ok: clarify.ok,
            output: clarify.detail,
            pauseForUser: true,
            data: { results },
          };
        }
        return {
          name: tool.name,
          ok: true,
          output: `No projects matched “${args.query}”.`,
          data: { results },
        };
      }
      case "knowledge.search": {
        const result = actions.knowledgeSearch(String(args.query));
        const results = result.results ?? [];
        if (!results.length) {
          return {
            name: tool.name,
            ok: true,
            output:
              "No matching knowledge-base excerpts. Tell the user you don't have that in workspace docs and suggest adding a knowledge-base file — do not invent pricing or policies.",
            data: { results },
          };
        }
        const lines = results.map(
          (r, i) =>
            `[${i + 1}] ${r.knowledgeBaseName} / ${r.fileName}: ${r.excerpt}`,
        );
        return {
          name: tool.name,
          ok: true,
          output: `Knowledge hits for “${args.query}”:\n${lines.join("\n")}`,
          data: { results },
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
          threadId: getTurnThreadId() ?? undefined,
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
