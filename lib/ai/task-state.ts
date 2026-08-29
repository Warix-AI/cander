/**
 * Per-thread active task state — separate from prose memory / chat transcript.
 */

export type TaskStatus =
  | "idle"
  | "awaiting_clarification"
  | "running"
  | "completed"
  | "failed";

export type ThreadTaskState = {
  threadId: string;
  goal: string;
  step: string;
  facts: Record<string, unknown>;
  pendingClarification?: {
    title: string;
    resumeTool?: string;
    resumeArguments?: Record<string, unknown>;
  } | null;
  status: TaskStatus;
  lastToolResults?: Array<{ name: string; ok: boolean; detail: string }>;
  updatedAt: string;
};

const byThread = new Map<string, ThreadTaskState>();

export function getThreadTaskState(
  threadId: string | null | undefined,
): ThreadTaskState | null {
  if (!threadId) return null;
  return byThread.get(threadId) ?? null;
}

export function upsertThreadTaskState(
  threadId: string,
  patch: Partial<Omit<ThreadTaskState, "threadId" | "updatedAt">> & {
    goal?: string;
  },
): ThreadTaskState {
  const prev = byThread.get(threadId);
  const next: ThreadTaskState = {
    threadId,
    goal: patch.goal ?? prev?.goal ?? "",
    step: patch.step ?? prev?.step ?? "",
    facts: { ...(prev?.facts ?? {}), ...(patch.facts ?? {}) },
    pendingClarification:
      patch.pendingClarification !== undefined
        ? patch.pendingClarification
        : (prev?.pendingClarification ?? null),
    status: patch.status ?? prev?.status ?? "idle",
    lastToolResults: patch.lastToolResults ?? prev?.lastToolResults,
    updatedAt: new Date().toISOString(),
  };
  byThread.set(threadId, next);
  return next;
}

export function clearThreadTaskState(threadId: string) {
  byThread.delete(threadId);
}

/** Move task state when migrating a chat onto another thread (e.g. project dock). */
export function migrateThreadTaskState(fromId: string, toId: string) {
  const cur = byThread.get(fromId);
  if (!cur) return;
  byThread.set(toId, {
    ...cur,
    threadId: toId,
    updatedAt: new Date().toISOString(),
  });
  byThread.delete(fromId);
}

export function formatTaskStateForPrompt(
  state: ThreadTaskState | null | undefined,
): string {
  if (!state || state.status === "idle") return "";
  const lines = [
    "Active task state (authoritative for this chat — continue this task):",
    state.goal ? `- Goal: ${state.goal}` : null,
    state.step ? `- Current step: ${state.step}` : null,
    `- Status: ${state.status}`,
  ];
  const factEntries = Object.entries(state.facts);
  if (factEntries.length) {
    lines.push("- Known facts:");
    for (const [k, v] of factEntries) {
      lines.push(`  - ${k}: ${JSON.stringify(v)}`);
    }
  }
  if (state.pendingClarification) {
    lines.push(
      `- Pending clarification: ${state.pendingClarification.title}${
        state.pendingClarification.resumeTool
          ? ` (resume ${state.pendingClarification.resumeTool})`
          : ""
      }`,
    );
  }
  lines.push(
    "Do not greet or restart. Do not invent a new task. Answer using this state.",
  );
  return lines.filter(Boolean).join("\n");
}

/** Pure helper for tests — merge prior summary with newly condensed turns. */
export function mergeCondensedSummaries(
  previousSummary: string | null | undefined,
  newlyCondensedTurns: string,
): string {
  const prev = (previousSummary ?? "").trim();
  const next = newlyCondensedTurns.trim();
  if (!prev) return next;
  if (!next) return prev;
  return [
    "Rolling conversation memory (merged):",
    "Prior summary:",
    prev,
    "",
    "Newly condensed turns (retain goals, names, decisions, pending questions):",
    next,
  ].join("\n");
}
