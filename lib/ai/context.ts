import type { AiContextRefKind } from "@/lib/ai/types";
import {
  assertContextRefAccess,
  formatContextBlock as formatBlock,
} from "@/lib/ai/authz";

/**
 * Build a small system context string from authorized refs (server / Edge).
 * Client must never invent entity contents — only pass ids; server resolves.
 */
export function formatContextBlock(
  lines: { kind: AiContextRefKind | string; title: string; detail?: string }[],
): string {
  return formatBlock(lines);
}

export function gateContextAccess(opts: {
  actorId: string;
  isWorkspaceMember: boolean;
  entityExists: boolean;
  entityWorkspaceId: string | null;
  requestedWorkspaceId: string | null;
}) {
  assertContextRefAccess(opts);
}
