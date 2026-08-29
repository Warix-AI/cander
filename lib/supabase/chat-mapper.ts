import type { Message, SpaceId, Thread } from "@/lib/types";

export type ThreadRow = {
  id: string;
  workspace_id: string;
  space_id: string | null;
  project_id: string | null;
  title: string;
  snippet: string;
  shared: boolean;
  persistent: boolean;
  session_summary: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  thread_id: string;
  workspace_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  at_label: string;
  blocks: Message["blocks"] | null;
  space_switch: Message["spaceSwitch"] | null;
  sort_order: number;
  created_at: string;
};

function isIsoTimestamp(value: string) {
  const t = Date.parse(value);
  return !Number.isNaN(t);
}

/** Prefer an ISO updatedAt from the client store; fall back to now. */
export function threadUpdatedAtIso(thread: Thread) {
  if (thread.updatedAt && isIsoTimestamp(thread.updatedAt)) {
    return new Date(thread.updatedAt).toISOString();
  }
  return new Date().toISOString();
}

export function threadRowToThread(
  row: ThreadRow,
  messages: Message[],
): Thread {
  return {
    id: row.id,
    title: row.title,
    workspaceId: row.workspace_id,
    projectId: row.project_id ?? undefined,
    spaceId: (row.space_id as SpaceId | null) ?? undefined,
    updatedAt: row.updated_at,
    snippet: row.snippet,
    messages,
    shared: row.shared || undefined,
    persistent: row.persistent || undefined,
    sessionSummary: row.session_summary,
    createdBy: row.created_by ?? undefined,
  };
}

export function threadToRow(
  thread: Thread,
  createdBy?: string | null,
): ThreadRow {
  const updated = threadUpdatedAtIso(thread);
  return {
    id: thread.id,
    workspace_id: thread.workspaceId,
    space_id: thread.spaceId ?? null,
    project_id: thread.projectId ?? null,
    title: thread.title,
    snippet: thread.snippet,
    shared: Boolean(thread.shared),
    persistent: Boolean(thread.persistent),
    session_summary: thread.sessionSummary ?? null,
    created_by: createdBy ?? thread.createdBy ?? null,
    created_at: updated,
    updated_at: updated,
  };
}

export function messageToRow(
  message: Message,
  threadId: string,
  workspaceId: string,
  sortOrder: number,
): MessageRow {
  return {
    id: message.id,
    thread_id: threadId,
    workspace_id: workspaceId,
    role: message.role,
    content: message.content,
    at_label: message.at,
    blocks: message.blocks ?? null,
    space_switch: message.spaceSwitch ?? null,
    sort_order: sortOrder,
    created_at: new Date().toISOString(),
  };
}

export function messageRowToMessage(row: MessageRow): Message {
  const condensed = row.content === "__CHAT_CONDENSED__";
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    at: row.at_label,
    blocks: row.blocks ?? undefined,
    spaceSwitch: row.space_switch ?? undefined,
    event: condensed ? "condensed" : undefined,
  };
}
