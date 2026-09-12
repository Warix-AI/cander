/**
 * Shared agent mutation helpers — AI tools and the builder UI use the same shapes.
 */

import type { AgentConfigPatch } from "@/lib/agents/types";

export type AgentMutationResult = {
  patch: AgentConfigPatch;
  summary: string;
};

/**
 * Update Expert name / Description (routing) / private Instructions / status.
 */
export function mutationUpdateMetadata(opts: {
  name?: string;
  description?: string;
  instructions?: string;
  enabled?: boolean;
}): AgentMutationResult {
  const patch: AgentConfigPatch = {};
  if (opts.name !== undefined) patch.name = opts.name;
  if (opts.description !== undefined) patch.description = opts.description;
  if (opts.instructions !== undefined) patch.instructions = opts.instructions;
  if (opts.enabled !== undefined) patch.enabled = opts.enabled;
  const parts: string[] = [];
  if (opts.name !== undefined) parts.push("name");
  if (opts.description !== undefined) parts.push("description");
  if (opts.instructions !== undefined) parts.push("instructions");
  if (opts.enabled !== undefined) {
    parts.push(opts.enabled ? "enabled" : "disabled");
  }
  return {
    patch,
    summary: parts.length
      ? `Updated expert ${parts.join(", ")}`
      : "No metadata changes",
  };
}

/** Writes private Instructions markdown (legacy skill tools map here). */
export function mutationSetInstructions(opts: {
  markdown: string;
  name?: string;
}): AgentMutationResult {
  const patch: AgentConfigPatch = {
    instructions: opts.markdown,
  };
  if (opts.name?.trim()) patch.name = opts.name.trim();
  return {
    patch,
    summary: "Updated expert instructions",
  };
}
