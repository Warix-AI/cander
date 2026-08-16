import type { SpaceId } from "./types";

export const CHAT_SPACES = ["build", "studio", "research", "skills"] as const;

export type ChatSpaceId = (typeof CHAT_SPACES)[number];

export function isChatSpace(
  id: SpaceId | null | undefined,
): id is ChatSpaceId {
  return Boolean(id && (CHAT_SPACES as readonly string[]).includes(id));
}
