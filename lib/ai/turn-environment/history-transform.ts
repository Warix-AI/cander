/**
 * Per-task history transform — shapes what the FM session sees (v4 §2.1, §9).
 * Primary mechanism: Cander-side transcript trimming before each FM call.
 */

import {
  buildSelectiveDialoguePrompt,
  type SelectiveDialogueOpts,
} from "../assistant-behavior.ts";
import {
  transcriptTurnCap,
  type TurnRelation,
} from "./turn-relation.ts";

export type HistoryTransformInput = {
  messages: Array<{ role: string; content: string }> | undefined;
  latestUserContent: string;
  turnRelation?: TurnRelation;
  activeLabels?: string[];
  reactivateLabel?: string;
};

/** Stateless per-request history shaping for FM prompts. */
export function applyHistoryTransform(input: HistoryTransformInput): string {
  const relation = input.turnRelation ?? "continuation";
  const opts: SelectiveDialogueOpts = {
    relation,
    maxTurns: transcriptTurnCap(relation),
    activeLabels: input.activeLabels,
    reactivateLabel: input.reactivateLabel,
  };
  return buildSelectiveDialoguePrompt(
    input.messages as Parameters<typeof buildSelectiveDialoguePrompt>[0],
    input.latestUserContent,
    opts,
  );
}
