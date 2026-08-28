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

function formatUpdatedAt(iso: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
    updatedAt: formatUpdatedAt(row.updated_at),
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
    created_by: createdBy ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    at: row.at_label,
    blocks: row.blocks ?? undefined,
    spaceSwitch: row.space_switch ?? undefined,
  };
}
