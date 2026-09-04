import type {
  ComposerBlock,
  ComposerConnectorScope,
} from "@/lib/composer-blocks";
import { emptyComposerBlocks, textFromBlocks } from "@/lib/composer-blocks";
import type { ChatFileAttachment, ChatImageAttachment } from "@/lib/types";

const STORAGE_PREFIX = "cander:composer-draft:";

export type ComposerDraftContext = {
  workspaceId: string;
  view: string;
  spaceId: string | null;
  threadId: string | null;
  projectId: string | null;
  connectorId: string | null;
  jobId: string | null;
  skillId: string | null;
  browser: "standalone" | "view" | null;
};

export type ComposerDraftSnapshot = {
  blocks: ComposerBlock[];
  dismissedConnectorIds: string[];
  manualConnectorIds: string[];
  files: ChatFileAttachment[];
  images: ChatImageAttachment[];
};

type StoredDraft = {
  blocks: ComposerBlock[];
  dismissedConnectorIds: string[];
  manualConnectorIds: string[];
};

const memory = new Map<string, ComposerDraftSnapshot>();

function storageKey(draftKey: string) {
  return `${STORAGE_PREFIX}${draftKey}`;
}

/** Stable key for an unsent composer context. */
export function composerDraftKey(ctx: ComposerDraftContext): string {
  return [
    ctx.workspaceId || "_",
    ctx.view || "_",
    ctx.spaceId || "_",
    ctx.threadId || "draft",
    ctx.projectId || "_",
    ctx.connectorId || "_",
    ctx.jobId || "_",
    ctx.skillId || "_",
    ctx.browser || "_",
  ].join("|");
}

/** Same shell when only the thread id changes (draft → armed thread). */
export function isComposerDraftThreadMigration(
  fromKey: string,
  toKey: string,
): boolean {
  const from = fromKey.split("|");
  const to = toKey.split("|");
  if (from.length !== to.length || from.length < 9) return false;
  // Indices: 0 workspace, 1 view, 2 space, 3 thread, 4 project, 5 connector, …
  if (from[3] !== "draft" || to[3] === "draft") return false;
  return from.every((part, i) => (i === 3 ? true : part === to[i]));
}

export function draftSnapshotHasContent(snap: ComposerDraftSnapshot): boolean {
  if (snap.files.length > 0 || snap.images.length > 0) return true;
  if (snap.blocks.some((b) => b.type === "connector" || b.type === "trigger")) {
    return true;
  }
  return textFromBlocks(snap.blocks).trim().length > 0;
}

export function readComposerDraft(
  draftKey: string,
): ComposerDraftSnapshot | null {
  const mem = memory.get(draftKey);
  if (mem && draftSnapshotHasContent(mem)) return mem;

  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(draftKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || !Array.isArray(parsed.blocks)) return null;
    const snap: ComposerDraftSnapshot = {
      blocks: parsed.blocks,
      dismissedConnectorIds: Array.isArray(parsed.dismissedConnectorIds)
        ? parsed.dismissedConnectorIds
        : [],
      manualConnectorIds: Array.isArray(parsed.manualConnectorIds)
        ? parsed.manualConnectorIds
        : [],
      files: mem?.files ?? [],
      images: mem?.images ?? [],
    };
    if (!draftSnapshotHasContent(snap)) return null;
    memory.set(draftKey, snap);
    return snap;
  } catch {
    return null;
  }
}

export function writeComposerDraft(
  draftKey: string,
  snap: ComposerDraftSnapshot,
): void {
  if (!draftSnapshotHasContent(snap)) {
    clearComposerDraft(draftKey);
    return;
  }
  memory.set(draftKey, snap);
  if (typeof window === "undefined") return;
  try {
    const stored: StoredDraft = {
      blocks: snap.blocks,
      dismissedConnectorIds: snap.dismissedConnectorIds,
      manualConnectorIds: snap.manualConnectorIds,
    };
    window.sessionStorage.setItem(storageKey(draftKey), JSON.stringify(stored));
  } catch {
    /* quota / private mode — memory map still keeps the draft this session */
  }
}

export function clearComposerDraft(draftKey: string): void {
  memory.delete(draftKey);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(draftKey));
  } catch {
    /* ignore */
  }
}

export function emptyDraftSnapshot(): ComposerDraftSnapshot {
  return {
    blocks: emptyComposerBlocks(),
    dismissedConnectorIds: [],
    manualConnectorIds: [],
    files: [],
    images: [],
  };
}

/** Move an unsent draft when a null-thread context gains a real thread id. */
export function migrateComposerDraft(fromKey: string, toKey: string): void {
  if (fromKey === toKey) return;
  const snap = readComposerDraft(fromKey);
  if (!snap) return;
  writeComposerDraft(toKey, snap);
  clearComposerDraft(fromKey);
}

export type { ComposerConnectorScope };
