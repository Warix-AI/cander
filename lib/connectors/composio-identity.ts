/**
 * Deterministic Composio user_id mapping — server-only.
 * One Composio user per Cander user per workspace (personal v1).
 */

const PREFIX = "cander";

export function composioUserId(workspaceId: string, profileId: string): string {
  const ws = workspaceId.trim();
  const profile = profileId.trim();
  if (!ws || !profile) {
    throw new Error("workspaceId and profileId are required");
  }
  return `${PREFIX}:${ws}:${profile}`;
}

export function parseComposioUserId(composioUserId: string): {
  workspaceId: string;
  profileId: string;
} | null {
  const parts = composioUserId.split(":");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const workspaceId = parts[1]?.trim();
  const profileId = parts[2]?.trim();
  if (!workspaceId || !profileId) return null;
  return { workspaceId, profileId };
}
