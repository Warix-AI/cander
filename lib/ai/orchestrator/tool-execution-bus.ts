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
): { detail: string; toolName?: string; phase: "tool" | "generating" | "follow_up" } | null {
  switch (event.type) {
    case "tool_start":
      return {
        phase: "tool",
        detail: detailForToolName(event.name),
        toolName: event.name,
      };
    case "model_generate_start":
      return { phase: "generating", detail: "Generating…" };
    case "model_generate_end":
      return null;
    case "tool_end":
      return event.ok
        ? { phase: "follow_up", detail: "Reading sources…", toolName: event.name }
        : null;
    default:
      return null;
  }
}

function detailForToolName(name: string): string {
  switch (name) {
    case "web.search":
      return "Searching the web…";
    case "web.open":
      return "Opening page…";
    case "computer.browser.open":
      return "Opening remote browser…";
    case "computer.browser.observe":
      return "Reading page structure…";
    case "computer.browser.click":
    case "computer.browser.fill":
      return "Using browser…";
    case "browser.current.get_context":
      return "Reading the page on the right…";
    case "browser.current.get_selection":
      return "Reading selection…";
    case "browser.current.capture_viewport":
      return "Capturing the viewport…";
    case "browser.current.get_metadata":
      return "Checking the active tab…";
    case "workspace.search":
      return "Searching workspace…";
    case "knowledge.search":
      return "Searching knowledge…";
    case "project.create":
      return "Creating project…";
    case "project.open":
      return "Opening project…";
    case "ui.ask_clarification":
      return "Preparing questions…";
    case "nav.open":
      return "Navigating…";
    default:
      return "Calling tool…";
  }
}
