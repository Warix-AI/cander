/**
 * In-memory speculative warm/draft cache (server). Short TTL; never persisted to chat.
 */

export type SpecWarmEntry = {
  warmHandle: string;
  userId: string;
  threadId: string | null;
  workspaceId: string | null;
  inputFingerprint: string;
  route: "LOCAL" | "WEB_REQUIRED" | "UNCERTAIN";
  textNorm: string;
  createdAt: number;
  expiresAt: number;
};

export type SpecDraftEntry = {
  warmHandle: string;
  userId: string;
  inputFingerprint: string;
  draftText: string;
  model: string;
  createdAt: number;
  expiresAt: number;
};

const WARM_TTL_MS = 60_000;
const DRAFT_TTL_MS = 45_000;
const MAX_ENTRIES = 200;

const warms = new Map<string, SpecWarmEntry>();
const drafts = new Map<string, SpecDraftEntry>();

function prune(map: Map<string, { expiresAt: number }>) {
  const now = Date.now();
  for (const [k, v] of map) {
    if (v.expiresAt <= now) map.delete(k);
  }
  while (map.size > MAX_ENTRIES) {
    const first = map.keys().next().value;
    if (first == null) break;
    map.delete(first);
  }
}

export function putSpecWarm(entry: Omit<SpecWarmEntry, "createdAt" | "expiresAt"> & {
  ttlMs?: number;
}): SpecWarmEntry {
  prune(warms);
  const now = Date.now();
  const full: SpecWarmEntry = {
    ...entry,
    createdAt: now,
    expiresAt: now + (entry.ttlMs ?? WARM_TTL_MS),
  };
  warms.set(entry.warmHandle, full);
  return full;
}

export function getSpecWarm(warmHandle: string): SpecWarmEntry | null {
  prune(warms);
  const e = warms.get(warmHandle);
  if (!e) return null;
  if (e.expiresAt <= Date.now()) {
    warms.delete(warmHandle);
    return null;
  }
  return e;
}

export function putSpecDraft(entry: Omit<SpecDraftEntry, "createdAt" | "expiresAt"> & {
  ttlMs?: number;
}): SpecDraftEntry {
  prune(drafts);
  const now = Date.now();
  const full: SpecDraftEntry = {
    ...entry,
    createdAt: now,
    expiresAt: now + (entry.ttlMs ?? DRAFT_TTL_MS),
  };
  drafts.set(`${entry.warmHandle}:${entry.inputFingerprint}`, full);
  return full;
}

export function getSpecDraft(
  warmHandle: string,
  inputFingerprint: string,
): SpecDraftEntry | null {
  prune(drafts);
  const e = drafts.get(`${warmHandle}:${inputFingerprint}`);
  if (!e) return null;
  if (e.expiresAt <= Date.now()) {
    drafts.delete(`${warmHandle}:${inputFingerprint}`);
    return null;
  }
  return e;
}

/** Per-user draft budget (server). */
const draftCounts = new Map<string, { count: number; windowStart: number }>();
const DRAFT_BUDGET_PER_MIN = 8;

export function allowSpecDraft(userId: string): boolean {
  const now = Date.now();
  const row = draftCounts.get(userId);
  if (!row || now - row.windowStart > 60_000) {
    draftCounts.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (row.count >= DRAFT_BUDGET_PER_MIN) return false;
  row.count += 1;
  return true;
}

export function clearSpeculationCacheForTests() {
  warms.clear();
  drafts.clear();
  draftCounts.clear();
}
