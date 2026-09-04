/**
 * Remember which project was open in each space so sidebar nav can restore
 * instead of always dumping to the space directory.
 */

import { safeLocalStorageSetItem } from "@/lib/safe-local-storage";
import type { SpaceId } from "@/lib/types";

const STORAGE_PREFIX = "courier-space-focus-v1";
/** Drop stale focus after a week of no visit. */
export const SPACE_FOCUS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type FocusEntry = {
  projectId: string;
  at: number;
};

type FocusMap = Record<string, FocusEntry>;

function storageKey(profileId: string, workspaceId: string) {
  return `${STORAGE_PREFIX}:${profileId}:${workspaceId}`;
}

function readMap(profileId: string, workspaceId: string): FocusMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(profileId, workspaceId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FocusMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(profileId: string, workspaceId: string, map: FocusMap) {
  safeLocalStorageSetItem(storageKey(profileId, workspaceId), JSON.stringify(map));
}

export function rememberSpaceProjectFocus(opts: {
  profileId: string;
  workspaceId: string;
  spaceId: SpaceId | string;
  projectId: string;
}) {
  const { profileId, workspaceId, spaceId, projectId } = opts;
  if (!profileId || !workspaceId || !spaceId || !projectId) return;
  const map = readMap(profileId, workspaceId);
  map[spaceId] = { projectId, at: Date.now() };
  writeMap(profileId, workspaceId, map);
}

export function readSpaceProjectFocus(opts: {
  profileId: string;
  workspaceId: string;
  spaceId: SpaceId | string;
}): string | null {
  const { profileId, workspaceId, spaceId } = opts;
  if (!profileId || !workspaceId || !spaceId) return null;
  const entry = readMap(profileId, workspaceId)[spaceId];
  if (!entry?.projectId) return null;
  if (Date.now() - entry.at > SPACE_FOCUS_TTL_MS) {
    clearSpaceProjectFocus({ profileId, workspaceId, spaceId });
    return null;
  }
  return entry.projectId;
}

export function clearSpaceProjectFocus(opts: {
  profileId: string;
  workspaceId: string;
  spaceId: SpaceId | string;
}) {
  const { profileId, workspaceId, spaceId } = opts;
  if (!profileId || !workspaceId || !spaceId) return;
  const map = readMap(profileId, workspaceId);
  if (!map[spaceId]) return;
  delete map[spaceId];
  writeMap(profileId, workspaceId, map);
}

/** Touch TTL without changing project (optional re-visit bump). */
export function touchSpaceProjectFocus(opts: {
  profileId: string;
  workspaceId: string;
  spaceId: SpaceId | string;
}) {
  const projectId = readSpaceProjectFocus(opts);
  if (!projectId) return;
  rememberSpaceProjectFocus({ ...opts, projectId });
}
