/**
 * Mirror Expert ↔ Cander runtime messages into a persistent local chat thread
 * keyed by Expert (agent) id so each Expert has its own conversation.
 */

import {
  getChatStoreSnapshot,
  upsertChatThread,
} from "@/lib/api/chat-store";
import type {
  AgentConversationMessage,
  AgentRun,
} from "@/lib/agents/types";
import {
  agentRuntimeChatId,
  upsertPersistentAgentRuntimeThread,
} from "@/lib/persistent-chat";
import type { Message, SpaceId, Thread } from "@/lib/types";

export const AGENT_RUNTIME_PENDING_ID = "agent-runtime-pending";

export function mapAgentConversationToMessages(
  messages: AgentConversationMessage[],
): Message[] {
  return messages
    .filter((m) => m.role === "agent" || m.role === "cander")
    .map((m) => ({
      id: m.id,
      role: (m.role === "agent" ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: m.content,
      at: m.createdAt,
      status: "complete" as const,
    }));
}

function snippetFromMessages(messages: Message[]) {
  const last = [...messages]
    .reverse()
    .find((m) => m.role === "user" || m.role === "assistant");
  const raw = last?.content?.trim().replace(/\s+/g, " ") ?? "";
  return raw.length > 120 ? `${raw.slice(0, 117).trimEnd()}…` : raw;
}

function withPendingThinking(messages: Message[], startedAt = Date.now()): Message[] {
  const without = messages.filter((m) => m.id !== AGENT_RUNTIME_PENDING_ID);
  return [
    ...without,
    {
      id: AGENT_RUNTIME_PENDING_ID,
      role: "assistant",
      content: "",
      at: new Date(startedAt).toISOString(),
      status: "pending",
      activity: {
        phase: "generating",
        startedAt,
        label: "Thinking",
      },
    },
  ];
}

export function ensureAgentRuntimeThread(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  spaceId: SpaceId;
  title?: string;
}): { thread: Thread; id: string } {
  const snapshot = getChatStoreSnapshot().threads;
  const { threads, id } = upsertPersistentAgentRuntimeThread(
    snapshot,
    opts.workspaceId,
    opts.projectId,
    opts.spaceId,
    opts.title ?? "Expert",
    opts.agentId,
  );
  const thread = threads.find((item) => item.id === id)!;
  if (!snapshot.some((item) => item.id === id)) {
    upsertChatThread(thread);
  } else if (thread !== snapshot.find((item) => item.id === id)) {
    upsertChatThread(thread);
  }
  return { thread, id };
}

function shouldKeepLocalPending(
  priorPending: Message | undefined,
  mapped: Message[],
  runs: AgentRun[] | undefined,
) {
  if (!priorPending) return false;
  if (runs?.some((run) => run.status === "running")) return true;
  const started = priorPending.activity?.startedAt ?? Date.parse(priorPending.at);
  if (!Number.isFinite(started)) return true;

  const finishedAfter = runs?.some((run) => {
    if (run.status === "running") return false;
    const at = Date.parse(run.completedAt ?? run.startedAt);
    return Number.isFinite(at) && at >= started - 5_000;
  });
  if (finishedAfter) return false;

  const replyAfter = mapped.some((message) => {
    if (message.role !== "assistant") return false;
    const at = Date.parse(message.at);
    return Number.isFinite(at) && at >= started - 5_000;
  });
  return !replyAfter;
}

/** Write server conversation into the local runtime thread (keeps local pending while running). */
export function applyAgentRuntimeMessages(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  spaceId: SpaceId;
  title?: string;
  messages: AgentConversationMessage[];
  runs?: AgentRun[];
  /** Force a trailing Thinking… row (e.g. Run now just clicked). */
  forcePending?: boolean;
}): string {
  const mapped = mapAgentConversationToMessages(opts.messages);
  const { id } = ensureAgentRuntimeThread({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    agentId: opts.agentId,
    spaceId: opts.spaceId,
    title: opts.title,
  });
  const existing =
    getChatStoreSnapshot().threads.find((item) => item.id === id) ?? null;
  const priorPending = existing?.messages.find(
    (m) => m.id === AGENT_RUNTIME_PENDING_ID,
  );
  const serverRunning = Boolean(
    opts.runs?.some((run) => run.status === "running"),
  );
  const keepPending = Boolean(
    opts.forcePending ||
      serverRunning ||
      shouldKeepLocalPending(priorPending, mapped, opts.runs),
  );
  const startedAt = priorPending?.activity?.startedAt ?? Date.now();
  const nextMessages = keepPending
    ? withPendingThinking(mapped, startedAt)
    : mapped.filter((m) => m.id !== AGENT_RUNTIME_PENDING_ID);

  const updated: Thread = {
    ...(existing ?? {
      id,
      title: opts.title ?? "Expert",
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      spaceId: opts.spaceId,
      persistent: true,
      sessionSummary: null,
      snippet: "",
      messages: [],
      updatedAt: new Date().toISOString(),
    }),
    title: opts.title?.trim() || existing?.title || "Expert",
    spaceId: opts.spaceId,
    messages: nextMessages,
    snippet: snippetFromMessages(nextMessages),
    updatedAt: new Date().toISOString(),
  };
  upsertChatThread(updated);
  return id;
}

export function markAgentRuntimeThinking(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  spaceId: SpaceId;
  title?: string;
}): string {
  const { id } = ensureAgentRuntimeThread(opts);
  const existing =
    getChatStoreSnapshot().threads.find((item) => item.id === id) ?? null;
  const base = existing?.messages.filter(
    (m) => m.id !== AGENT_RUNTIME_PENDING_ID,
  ) ?? [];
  const nextMessages = withPendingThinking(base);
  upsertChatThread({
    ...(existing ?? {
      id,
      title: opts.title ?? "Expert",
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      spaceId: opts.spaceId,
      persistent: true,
      sessionSummary: null,
      snippet: "",
      updatedAt: new Date().toISOString(),
      messages: [],
    }),
    messages: nextMessages,
    snippet: snippetFromMessages(nextMessages),
    updatedAt: new Date().toISOString(),
  });
  return id;
}

export function agentRuntimeThreadId(
  workspaceId: string,
  projectId: string,
  agentId?: string | null,
) {
  return agentRuntimeChatId(workspaceId, projectId, agentId);
}
