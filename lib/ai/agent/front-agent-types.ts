/** Shared (browser-safe) types for the Cander front agent. */

export type FrontAgentAction = "answer" | "plan" | "edit" | "create" | "publish" | "undo";

export interface FrontAgentDecision {
  action: FrontAgentAction;
  /** What Cander says to the user (required for answer/plan; short ack otherwise). */
  reply: string;
  /** For edit/create: a self-contained instruction for the builder. For undo: the version id to go back to. */
  instruction: string | null;
}
