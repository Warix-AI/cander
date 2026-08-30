/**
 * Bridge payload for future Apple DynamicInstructions / DynamicProfile.
 * TS compiler remains source of truth; Swift can consume this JSON later.
 */

import type { TurnProfile } from "./types.ts";
import { formatTurnProfileInstructions } from "./compile.ts";

export type DynamicProfilePayload = {
  version: 1;
  instructions: string;
  toolNames: string[];
  toolMode: TurnProfile["toolMode"];
  clarificationRequired: boolean;
  density: TurnProfile["density"];
  budgets: TurnProfile["budgets"];
  outputSchema: TurnProfile["outputSchema"];
};

/** Serialize TurnProfile for native DynamicInstructions when OS supports it. */
export function toDynamicProfilePayload(
  profile: TurnProfile,
  extraInstructions?: string,
): DynamicProfilePayload {
  return {
    version: 1,
    instructions: formatTurnProfileInstructions(profile, extraInstructions),
    toolNames: profile.tools.map((t) => t.name),
    toolMode: profile.toolMode,
    clarificationRequired: profile.clarificationPolicy.clarificationRequired,
    density: profile.density,
    budgets: profile.budgets,
    outputSchema: profile.outputSchema,
  };
}
