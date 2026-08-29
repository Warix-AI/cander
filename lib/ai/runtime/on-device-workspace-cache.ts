/**
 * Local workspace snapshot for Apple on-device AI.
 *
 * Built from client caches (chat store, space entities, members) — stays on device.
 * Cloud Edge still builds its own inventory; this mirrors that quality for LOCAL.
 */

import { getChatStoreSnapshot } from "@/lib/api/chat-store";
import {
  getSpaceEntityStoreSnapshot,
  localSpaceEntityStore,
} from "@/lib/api/space-entity-store";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { getOnboardingCheckpointSnapshot } from "@/lib/onboarding-checkpoint";
import { getActorSnapshot } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { navLabel } from "@/lib/use-main-nav-items";
import type { SpaceId, Thread } from "@/lib/types";
import { getMembersSnapshot } from "@/lib/workspace-policy";
import { getWorkspaceCatalogSnapshot } from "@/lib/workspace-catalog";

const IDENTITY_KEY = "cander-on-device-identity-v1";
const INVENTORY_KEY_PREFIX = "cander-on-device-inventory-v1:";
const MAX_PROJECTS = 20;
const MAX_SOURCES = 12;
const MAX_THREADS = 18;
const MAX_TRANSCRIPT_TURNS = 10;
const MAX_MSG_CHARS = 420;
/** Soft budget so Foundation Models instructions stay usable. */
const MAX_INVENTORY_CHARS = 7_500;
const REMOTE_INVENTORY_TTL_MS = 120_000;

export type OnDeviceIdentity = {
  shortName: string;
  fullName?: string;
  email?: string;
};

type CachedIdentity = OnDeviceIdentity & { at: number };

type SnapshotOpts = {
  workspaceId: string;
  projectId?: string | null;
  projectSpace?: string | null;
  aiChatId?: string | null;
  threadId?: string | null;
};

export type OnDeviceWorkspaceSnapshot = {
  shortName: string | null;
  fullName: string | null;
  email: string | null;
  workspaceName: string | null;
  projectTitle: string | null;
  spaceLabel: string | null;
  /** Human inventory + current-chat meta for system instructions. */
  inventoryBlock: string;
  /** Recent prior turns for this chat (excludes the in-flight user turn). */
  transcriptBlock: string;
  cacheKey: string;
};

function readCachedIdentity(): OnDeviceIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedIdentity;
    if (!parsed?.shortName?.trim()) return null;
    return {
      shortName: parsed.shortName.trim(),
      fullName: parsed.fullName?.trim() || undefined,
      email: parsed.email?.trim() || undefined,
    };
  } catch {
    return null;
  }
}

/** Persist preferred name so on-device AI still knows you after member hydrate misses. */
export function persistOnDeviceIdentity(identity: OnDeviceIdentity) {
  if (typeof window === "undefined") return;
  const shortName = identity.shortName.trim();
  if (!shortName) return;
  const payload: CachedIdentity = {
    shortName,
    fullName: identity.fullName?.trim() || undefined,
    email: identity.email?.trim() || undefined,
    at: Date.now(),
  };
  try {
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota
  }
}

function resolveIdentitySync(): OnDeviceIdentity | null {
  const actorId = getActorSnapshot();
  const member = actorId
    ? getMembersSnapshot().find((item) => item.id === actorId)
    : undefined;
  if (member?.short?.trim() && member.short !== "Member" && member.short !== "You") {
    const id: OnDeviceIdentity = {
      shortName: member.short.trim(),
      fullName: member.name?.trim() || undefined,
      email: member.email?.trim() || undefined,
    };
    persistOnDeviceIdentity(id);
    return id;
  }
  if (member?.name?.trim()) {
    const short =
      member.short?.trim() && member.short !== "Member"
        ? member.short.trim()
        : member.name.trim().split(/\s+/)[0] || member.name.trim();
    const id: OnDeviceIdentity = {
      shortName: short,
      fullName: member.name.trim(),
      email: member.email?.trim() || undefined,
    };
    persistOnDeviceIdentity(id);
    return id;
  }

  const cached = readCachedIdentity();
  if (cached) return cached;

  const checkpoint = getOnboardingCheckpointSnapshot();
  const cpShort =
    checkpoint?.shortName?.trim() ||
    checkpoint?.name?.trim()?.split(/\s+/)[0] ||
    null;
  if (cpShort) {
    const id: OnDeviceIdentity = {
      shortName: cpShort,
      fullName: checkpoint?.name?.trim() || undefined,
      email: checkpoint?.email?.trim() || undefined,
    };
    persistOnDeviceIdentity(id);
    return id;
  }
  return null;
}

/** Fetch profile short_name when local member cache is empty (once per cold start). */
let profileFetch: Promise<OnDeviceIdentity | null> | null = null;

export async function ensureOnDeviceIdentity(): Promise<OnDeviceIdentity | null> {
  const sync = resolveIdentitySync();
  if (sync?.shortName) return sync;
  if (typeof window === "undefined" || !isSupabaseConfigured()) return sync;
  if (!profileFetch) {
    profileFetch = (async () => {
      try {
        const { createSupabaseBrowserClient } = await import(
          "@/lib/supabase/client"
        );
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return null;
        const { data: profile } = await supabase
          .from("profiles")
          .select("name, short_name, email")
          .eq("id", user.id)
          .maybeSingle();
        const fullName =
          (typeof profile?.name === "string" && profile.name.trim()) ||
          (typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name.trim()
            : "") ||
          (typeof user.user_metadata?.name === "string"
            ? user.user_metadata.name.trim()
            : "") ||
          "";
        const shortName =
          (typeof profile?.short_name === "string" &&
            profile.short_name.trim()) ||
          fullName.split(/\s+/)[0] ||
          (typeof user.email === "string"
            ? user.email.split("@")[0]
            : "") ||
          "";
        if (!shortName) return null;
        const id: OnDeviceIdentity = {
          shortName,
          fullName: fullName || undefined,
          email:
            (typeof profile?.email === "string" && profile.email.trim()) ||
            user.email ||
            undefined,
        };
        persistOnDeviceIdentity(id);
        return id;
      } catch {
        return null;
      }
    })();
  }
  return (await profileFetch) ?? sync;
}

function findThread(opts: SnapshotOpts): Thread | null {
  const { threads } = getChatStoreSnapshot();
  if (opts.threadId) {
    const byId = threads.find((item) => item.id === opts.threadId);
    if (byId) return byId;
  }
  if (opts.aiChatId) {
    const byAi = threads.find(
      (item) => item.aiChatId === opts.aiChatId || item.id === opts.aiChatId,
    );
    if (byAi) return byAi;
  }
  if (opts.projectId) {
    const byProject = threads.find((item) => item.projectId === opts.projectId);
    if (byProject) return byProject;
  }
  return null;
}

function truncate(text: string, max: number) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type RemoteInventoryItem = {
  title: string;
  space?: string;
  kind?: string;
  updatedAt: string;
};

type RemoteInventoryCache = {
  at: number;
  projects: RemoteInventoryItem[];
  sources: RemoteInventoryItem[];
};

function inventoryStorageKey(workspaceId: string) {
  return `${INVENTORY_KEY_PREFIX}${workspaceId}`;
}

function readRemoteInventoryCache(
  workspaceId: string,
): RemoteInventoryCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(inventoryStorageKey(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RemoteInventoryCache;
    if (!parsed?.at || !Array.isArray(parsed.projects)) return null;
    if (Date.now() - parsed.at > REMOTE_INVENTORY_TTL_MS * 6) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRemoteInventoryCache(
  workspaceId: string,
  cache: RemoteInventoryCache,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      inventoryStorageKey(workspaceId),
      JSON.stringify(cache),
    );
  } catch {
    // ignore quota
  }
}

const remoteInventoryInflight = new Map<string, Promise<RemoteInventoryCache | null>>();

/**
 * Refresh project/source titles from Supabase into a short-lived local cache.
 * Does not send chat prompts — metadata only, for on-device instructions.
 */
export async function refreshOnDeviceInventoryCache(
  workspaceId: string,
  opts?: { force?: boolean },
): Promise<RemoteInventoryCache | null> {
  if (!workspaceId || typeof window === "undefined" || !isSupabaseConfigured()) {
    return readRemoteInventoryCache(workspaceId);
  }
  const existing = readRemoteInventoryCache(workspaceId);
  if (
    !opts?.force &&
    existing &&
    Date.now() - existing.at < REMOTE_INVENTORY_TTL_MS
  ) {
    return existing;
  }
  const inflight = remoteInventoryInflight.get(workspaceId);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      const { createSupabaseBrowserClient } = await import(
        "@/lib/supabase/client"
      );
      const supabase = createSupabaseBrowserClient();
      const [{ data: projects }, { data: sources }] = await Promise.all([
        supabase
          .from("projects")
          .select("title, kind, space_id, updated_at")
          .eq("workspace_id", workspaceId)
          .order("updated_at", { ascending: false })
          .limit(MAX_PROJECTS),
        supabase
          .from("sources")
          .select("title, updated_at")
          .eq("workspace_id", workspaceId)
          .order("updated_at", { ascending: false })
          .limit(MAX_SOURCES),
      ]);
      const cache: RemoteInventoryCache = {
        at: Date.now(),
        projects: (projects ?? []).map((p) => ({
          title: String(p.title ?? "Untitled"),
          space: p.space_id ? String(p.space_id) : undefined,
          kind: p.kind ? String(p.kind) : undefined,
          updatedAt: String(p.updated_at ?? new Date().toISOString()),
        })),
        sources: (sources ?? []).map((s) => ({
          title: String(s.title ?? "Untitled"),
          updatedAt: String(s.updated_at ?? new Date().toISOString()),
        })),
      };
      writeRemoteInventoryCache(workspaceId, cache);
      return cache;
    } catch {
      return existing;
    } finally {
      remoteInventoryInflight.delete(workspaceId);
    }
  })();

  remoteInventoryInflight.set(workspaceId, task);
  return task;
}

function mergeProjects(
  local: RemoteInventoryItem[],
  remote: RemoteInventoryItem[] | undefined,
): RemoteInventoryItem[] {
  const byTitle = new Map<string, RemoteInventoryItem>();
  for (const item of [...remote ?? [], ...local]) {
    const key = item.title.trim().toLowerCase();
    if (!key) continue;
    const prev = byTitle.get(key);
    if (
      !prev ||
      new Date(item.updatedAt).getTime() > new Date(prev.updatedAt).getTime()
    ) {
      byTitle.set(key, item);
    }
  }
  return [...byTitle.values()].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

function buildInventoryLines(opts: SnapshotOpts, thread: Thread | null): string[] {
  const actorId = getActorSnapshot();
  const ctx = { workspaceId: opts.workspaceId, actorId: actorId || "local" };
  const remote = readRemoteInventoryCache(opts.workspaceId);
  const lines: string[] = [];

  lines.push(
    "Workspace inventory (cached on this device — prefer titles over ids):",
  );
  lines.push(
    "Use this list to answer questions about projects, recent chats, and when something was last active. Do not invent items that are not listed.",
  );

  if (thread) {
    const firstAt = thread.messages[0]?.at;
    lines.push("");
    lines.push("Current chat:");
    lines.push(`- Title: ${thread.title || "Untitled"}`);
    lines.push(
      `- Last activity: ${formatRelativeTime(thread.updatedAt)} (${thread.updatedAt})`,
    );
    if (firstAt) {
      lines.push(
        `- Started / first message: ${formatRelativeTime(firstAt)} (${firstAt})`,
      );
    }
    if (thread.spaceId) {
      lines.push(
        `- Space: ${navLabel(thread.spaceId) ?? thread.spaceId}`,
      );
    }
    if (thread.sessionSummary?.trim()) {
      lines.push(`- Session summary: ${truncate(thread.sessionSummary, 240)}`);
    }
  }

  try {
    const localProjects = localSpaceEntityStore.listAllProjects(ctx).map((p) => ({
      title: p.title,
      space: p.space,
      kind: p.kind,
      updatedAt: p.updatedAt,
    }));
    const projects = mergeProjects(localProjects, remote?.projects);
    if (projects.length) {
      lines.push("");
      lines.push(
        `Projects (most recently updated first, showing ${Math.min(projects.length, MAX_PROJECTS)} of ${projects.length}):`,
      );
      for (const p of projects.slice(0, MAX_PROJECTS)) {
        const space = p.space
          ? navLabel(p.space as SpaceId) ?? p.space
          : "project";
        const kind = p.kind ?? "general";
        lines.push(
          `- ${p.title} [${space}/${kind}] updated ${formatRelativeTime(p.updatedAt)}`,
        );
      }
      const latest = projects[0];
      if (latest) {
        lines.push(
          `Latest project by activity: “${latest.title}” (${formatRelativeTime(latest.updatedAt)}).`,
        );
      }
    } else {
      lines.push("");
      lines.push("Projects: none cached on this device yet.");
    }
  } catch {
    lines.push("Projects: could not read local project cache.");
  }

  try {
    const localSources = localSpaceEntityStore.listSources(ctx).map((s) => ({
      title: s.title,
      updatedAt: s.updatedAt,
    }));
    const sources = mergeProjects(localSources, remote?.sources);
    if (sources.length) {
      lines.push("");
      lines.push(
        `Sources (recent, showing ${Math.min(sources.length, MAX_SOURCES)} of ${sources.length}):`,
      );
      for (const s of sources.slice(0, MAX_SOURCES)) {
        lines.push(
          `- ${s.title} updated ${formatRelativeTime(s.updatedAt)}`,
        );
      }
    }
  } catch {
    // optional
  }

  const { threads } = getChatStoreSnapshot();
  const recent = threads
    .filter((item) => item.workspaceId === opts.workspaceId)
    .filter((item) => item.messages?.length > 0 || item.snippet?.trim())
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, MAX_THREADS);
  if (recent.length) {
    lines.push("");
    lines.push("Recent chats (Recents order):");
    for (const t of recent) {
      const space = t.spaceId
        ? navLabel(t.spaceId) ?? t.spaceId
        : "Chat";
      const title = t.title?.trim() || t.snippet?.trim() || "Untitled chat";
      lines.push(
        `- “${truncate(title, 80)}” [${space}] last open/active ${formatRelativeTime(t.updatedAt)}`,
      );
    }
  }

  return lines;
}

function buildTranscriptBlock(thread: Thread | null, currentContent: string): string {
  if (!thread?.messages?.length) return "";
  const prior = thread.messages.filter((m) => {
    if (m.role === "system" || m.event) return false;
    if (m.status === "pending" || m.status === "streaming") return false;
    // Drop the in-flight duplicate of the current user turn if already appended.
    if (
      m.role === "user" &&
      m.content.trim() === currentContent.trim() &&
      m === thread.messages[thread.messages.length - 1]
    ) {
      return false;
    }
    return m.role === "user" || m.role === "assistant";
  });
  const slice = prior.slice(-MAX_TRANSCRIPT_TURNS);
  if (!slice.length) return "";
  const lines = [
    "Recent turns in this chat (for continuity — answer the latest user message in the prompt):",
  ];
  for (const m of slice) {
    const label = m.role === "user" ? "User" : "Assistant";
    lines.push(`${label}: ${truncate(m.content, MAX_MSG_CHARS)}`);
  }
  return lines.join("\n");
}

const snapshotMemo = new Map<
  string,
  { at: number; snapshot: OnDeviceWorkspaceSnapshot }
>();
const MEMO_TTL_MS = 8_000;

/**
 * Build (and briefly cache) the on-device workspace snapshot for LOCAL inference.
 */
export function getOnDeviceWorkspaceSnapshot(
  opts: SnapshotOpts & { currentContent?: string },
): OnDeviceWorkspaceSnapshot {
  const identity = resolveIdentitySync();
  const workspace = getWorkspaceCatalogSnapshot().find(
    (item) => item.id === opts.workspaceId,
  );
  const actorId = getActorSnapshot();
  const entityRev = getSpaceEntityStoreSnapshot().revision;
  const chatRev = getChatStoreSnapshot().revision;
  const remoteAt = readRemoteInventoryCache(opts.workspaceId)?.at ?? 0;
  const cacheKey = `${opts.workspaceId}:${opts.threadId ?? ""}:${opts.projectId ?? ""}:${opts.aiChatId ?? ""}:${entityRev}:${chatRev}:${remoteAt}:${identity?.shortName ?? ""}`;

  const memo = snapshotMemo.get(cacheKey);
  if (memo && Date.now() - memo.at < MEMO_TTL_MS) {
    // Refresh transcript only (depends on current turn).
    if (opts.currentContent !== undefined) {
      const thread = findThread(opts);
      return {
        ...memo.snapshot,
        transcriptBlock: buildTranscriptBlock(thread, opts.currentContent),
      };
    }
    return memo.snapshot;
  }

  const thread = findThread(opts);
  let projectTitle: string | null = null;
  let spaceLabel: string | null = null;

  if (opts.projectId && actorId) {
    try {
      const project = localSpaceEntityStore.getProject(
        { workspaceId: opts.workspaceId, actorId },
        opts.projectId,
      );
      projectTitle = project?.title ?? null;
      if (project?.space) {
        spaceLabel = navLabel(project.space as SpaceId) ?? project.space;
      }
    } catch {
      // ignore
    }
  }
  if (!spaceLabel && opts.projectSpace) {
    spaceLabel =
      navLabel(opts.projectSpace as SpaceId) ?? String(opts.projectSpace);
  }
  if (!spaceLabel && thread?.spaceId) {
    spaceLabel = navLabel(thread.spaceId) ?? thread.spaceId;
  }

  let inventoryLines = buildInventoryLines(opts, thread);
  let inventoryBlock = inventoryLines.join("\n");
  while (
    inventoryBlock.length > MAX_INVENTORY_CHARS &&
    inventoryLines.length > 12
  ) {
    inventoryLines = inventoryLines.slice(0, -1);
    inventoryBlock = inventoryLines.join("\n");
  }

  const snapshot: OnDeviceWorkspaceSnapshot = {
    shortName: identity?.shortName ?? null,
    fullName: identity?.fullName ?? null,
    email: identity?.email ?? null,
    workspaceName: workspace?.name ?? null,
    projectTitle,
    spaceLabel,
    inventoryBlock,
    transcriptBlock: buildTranscriptBlock(thread, opts.currentContent ?? ""),
    cacheKey,
  };
  snapshotMemo.set(cacheKey, { at: Date.now(), snapshot });
  return snapshot;
}
