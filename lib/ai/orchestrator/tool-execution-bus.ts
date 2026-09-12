/**
 * Per-turn tool instrumentation — drives UI status and debug logs.
 */

export type ToolExecutionEvent =
  | {
      type: "tool_start";
      name: string;
      reason?: string;
      deterministic?: boolean;
      round?: number;
    }
  | {
      type: "tool_end";
      name: string;
      ok: boolean;
      durationMs: number;
      round?: number;
    }
  | { type: "evidence_added"; count: number; kinds: string[] }
  | { type: "model_generate_start"; round: number }
  | { type: "model_generate_end"; round: number; structured: boolean };

export type ToolExecutionListener = (event: ToolExecutionEvent) => void;

let listeners = new Set<ToolExecutionListener>();
let turnListener: ToolExecutionListener | null = null;

export function subscribeToolExecution(listener: ToolExecutionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Scoped to a single assistant turn (orchestrator opts.onProgress maps here). */
export function setTurnToolExecutionListener(
  listener: ToolExecutionListener | null,
) {
  turnListener = listener;
}

export function emitToolExecution(event: ToolExecutionEvent) {
  turnListener?.(event);
  for (const l of listeners) {
    try {
      l(event);
    } catch {
      // telemetry must never break a turn
    }
  }
}

export function mapToolEventToProgressLabel(
  event: ToolExecutionEvent,
): {
  detail: string;
  toolName?: string;
  phase: "tool" | "generating" | "follow_up";
  toolOk?: boolean;
} | null {
  switch (event.type) {
    case "tool_start":
      return {
        phase: "tool",
        detail: detailForToolName(event.name),
        toolName: event.name,
      };
    case "model_generate_start":
      return { phase: "generating", detail: "Generating" };
    case "model_generate_end":
      return null;
    case "tool_end":
      if (event.name.startsWith("agent.")) {
        return {
          phase: "follow_up",
          detail: detailForToolName(event.name),
          toolName: event.name,
          toolOk: event.ok,
        };
      }
      return event.ok
        ? { phase: "follow_up", detail: "Reading", toolName: event.name }
        : null;
    default:
      return null;
  }
}

function detailForToolName(name: string): string {
  if (name.startsWith("agent.")) {
    // Keep in sync with lib/ai/agents/labels.ts — avoid circular imports here.
    if (name === "agent.get") return "Inspecting expert";
    if (name.startsWith("experts.")) {
      if (name === "experts.list") return "Listing experts";
      if (name === "experts.search") return "Searching experts";
      if (name === "experts.consult") return "Consulting expert";
      return "Experts";
    }
    if (name === "agent.skill.create") return "Creating skill";
    if (name === "agent.skill.update") return "Updating skill";
    if (name === "agent.skill.attach") return "Attaching skill";
    if (name === "agent.skill.remove") return "Removing skill";
    if (name === "agent.tools.grant") return "Allowing connector tools";
    if (name === "agent.tools.revoke") return "Revoking connector tools";
    if (name === "agent.knowledge.attach") return "Attaching knowledge";
    if (name === "agent.knowledge.remove") return "Removing knowledge";
    if (name === "agent.trigger.set") return "Setting trigger";
    if (name === "agent.validate") return "Validating agent";
    if (name === "agent.run") return "Running agent";
    return "Updating agent";
  }
  switch (name) {
    case "web.search":
    case "web.research":
    case "workspace.search":
    case "knowledge.search":
      return "Searching";
    case "web.open":
    case "web.read":
    case "computer.browser.open":
    case "computer.browser.observe":
    case "browser.current.get_context":
    case "browser.current.get_selection":
    case "browser.current.capture_viewport":
      return "Reading";
    case "computer.browser.click":
    case "computer.browser.fill":
      return "Updating";
    case "browser.current.get_metadata":
    case "ui.ask_clarification":
      return "Checking";
    case "project.create":
    case "project.open":
    case "nav.open":
      return "Building";
    default:
      return "Updating";
  }
}
