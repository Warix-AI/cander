import type { Message, SpaceId, Thread } from "@/lib/types";
import { resolveChatImageUrl } from "@/lib/chat-attachment-image-url";

export type ThreadRow = {
  id: string;
  workspace_id: string;
  space_id: string | null;
  project_id: string | null;
  connector_id?: string | null;
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
  citations: Message["citations"] | null;
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
  const connectorFromId = row.id.startsWith(`t-conn-${row.workspace_id}-`)
    ? row.id.slice(`t-conn-${row.workspace_id}-`.length)
    : undefined;
  return {
    id: row.id,
    title: row.title,
    workspaceId: row.workspace_id,
    projectId: row.project_id ?? undefined,
    connectorId: row.connector_id ?? connectorFromId ?? undefined,
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
  existingCreatedAt?: string | null,
): ThreadRow {
  const updated = threadUpdatedAtIso(thread);
  const created =
    existingCreatedAt && isIsoTimestamp(existingCreatedAt)
      ? new Date(existingCreatedAt).toISOString()
      : updated;
  return {
    id: thread.id,
    workspace_id: thread.workspaceId,
    space_id: thread.spaceId ?? null,
    project_id: thread.projectId ?? null,
    connector_id: thread.connectorId ?? null,
    title: thread.title,
    snippet: thread.snippet,
    shared: Boolean(thread.shared),
    persistent: Boolean(thread.persistent),
    session_summary: thread.sessionSummary ?? null,
    created_by: createdBy ?? thread.createdBy ?? null,
    created_at: created,
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
    citations: message.citations ?? [],
    sort_order: sortOrder,
    created_at: new Date().toISOString(),
  };
}

/** Omit blocks when not loaded locally so upserts don't wipe remote image payloads. */
export function messageToUpsertRow(
  message: Message,
  threadId: string,
  workspaceId: string,
  sortOrder: number,
): Record<string, unknown> {
  const normalized =
    message.blocks === undefined
      ? message
      : { ...message, blocks: sanitizeBlocksForRemoteSync(message.blocks) };
  const row = messageToRow(normalized, threadId, workspaceId, sortOrder);
  if (message.blocks === undefined) {
    const { blocks: _blocks, ...rest } = row;
    return rest;
  }
  return row;
}

function sanitizeBlocksForRemoteSync(
  blocks: NonNullable<Message["blocks"]>,
): NonNullable<Message["blocks"]> {
  return blocks.map((block) => {
    if (block.type === "image_generation") {
      const imageUrl = resolveChatImageUrl({
        attachmentId: block.attachmentId,
        dataUrl: block.imageUrl,
      });
      if (!imageUrl || imageUrl === block.imageUrl) return block;
      return { ...block, imageUrl };
    }
    if (block.type === "image") {
      const url = resolveChatImageUrl({
        attachmentId: block.attachmentId,
        dataUrl: block.url,
      });
      if (!url || url === block.url) return block;
      return { ...block, url };
    }
    return block;
  });
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
    citations: row.citations?.length ? row.citations : undefined,
    event: condensed ? "condensed" : undefined,
  };
}
