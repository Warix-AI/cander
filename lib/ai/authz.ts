/**
 * Pure helpers for private AI chat authorization assertions (unit-tested).
 * Live RLS is enforced in Postgres; these mirror Edge Function checks.
 * Kept dependency-free so `npm run test:security` can load this file under Node.
 */

export type AiChatOwnerGate = {
  chatOwnerId: string;
  actorId: string;
};

export function assertAiChatOwner(gate: AiChatOwnerGate): void {
  if (!gate.actorId || gate.chatOwnerId !== gate.actorId) {
    throw new Error("Forbidden: chat is private to its owner");
  }
}

export function assertNotSharedWorkspaceAccess(opts: {
  actorId: string;
  chatOwnerId: string;
  isWorkspaceMember: boolean;
}): void {
  // Workspace membership must never grant chat access.
  if (opts.actorId !== opts.chatOwnerId) {
    throw new Error("Forbidden: workspace members cannot access private AI chats");
  }
  void opts.isWorkspaceMember;
}

/** Intelligence rows must never land in a shared null-workspace bucket. */
export function assertIntelligenceWorkspaceBound(opts: {
  workspaceId: string | null | undefined;
  isWorkspaceMember: boolean;
}): string {
  const workspaceId = opts.workspaceId?.trim() || "";
  if (!workspaceId) {
    throw new Error("Forbidden: intelligence rows require a workspace_id");
  }
  if (!opts.isWorkspaceMember) {
    throw new Error("Forbidden: not a member of the intelligence workspace");
  }
  return workspaceId;
}

/** Attach workspace to a new chat only when the actor is a member. */
export function resolveChatWorkspaceId(opts: {
  requestedWorkspaceId: string | null | undefined;
  isWorkspaceMember: boolean;
}): string | null {
  const requested = opts.requestedWorkspaceId?.trim() || null;
  if (!requested || !opts.isWorkspaceMember) return null;
  return requested;
}

export type ContextAccessGate = {
  actorId: string;
  isWorkspaceMember: boolean;
  entityExists: boolean;
  entityWorkspaceId: string | null;
  requestedWorkspaceId: string | null;
};

export function assertContextRefAccess(gate: ContextAccessGate): void {
  if (!gate.entityExists) {
    throw new Error("Invalid context reference");
  }
  if (!gate.isWorkspaceMember) {
    throw new Error("Forbidden: not a member of the context workspace");
  }
  if (
    gate.requestedWorkspaceId &&
    gate.entityWorkspaceId &&
    gate.requestedWorkspaceId !== gate.entityWorkspaceId
  ) {
    throw new Error("Invalid context reference: workspace mismatch");
  }
}

export function isLocalOrPrivateUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return true;
    }
    if (host.endsWith(".local")) return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    return false;
  } catch {
    return true;
  }
}

export function assertBridgeUrlSafeForEdge(url: string): void {
  if (!url.startsWith("https://")) {
    throw new Error("Bridge URL must use HTTPS");
  }
  if (isLocalOrPrivateUrl(url)) {
    throw new Error(
      "Bridge URL must not be localhost or a private network address",
    );
  }
}

export function formatContextBlock(
  lines: { kind: string; title: string; detail?: string }[],
): string {
  if (!lines.length) return "";
  return [
    "The user is viewing the following authorized workspace context:",
    ...lines.map(
      (line) =>
        `- ${line.kind}: ${line.title}${line.detail ? ` (${line.detail})` : ""}`,
    ),
    "Use this context only; do not invent access to other workspace data.",
  ].join("\n");
}
