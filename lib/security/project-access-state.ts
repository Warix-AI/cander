/**
 * Pure project-access helpers (no Supabase) — safe for Node unit tests.
 */

/** Shared = business kind OR member count >= 2. */
export function isSharedWorkspaceState(opts: {
  kind: string | null | undefined;
  memberCount: number;
}): boolean {
  return opts.kind === "business" || opts.memberCount >= 2;
}

/** Member + (creator OR shared). */
export function canAccessProjectState(opts: {
  actorId: string;
  createdBy: string | null;
  isMember: boolean;
  shared: boolean;
}): boolean {
  if (!opts.isMember) return false;
  if (opts.shared) return true;
  return opts.createdBy === opts.actorId;
}
