export type GmailNavId =
  | "inbox"
  | "compose"
  | "labels"
  | "filters"
  | "tools";

export const gmailNav: { id: GmailNavId; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "compose", label: "Compose" },
  { id: "labels", label: "Labels" },
  { id: "filters", label: "Filters" },
  { id: "tools", label: "Tools" },
];

/** MCP tools exposed by Gmail (workspace-mcp / gmailmcp.googleapis.com). */
export const gmailMcpTools = [
  {
    id: "search_gmail_messages",
    tier: "Core" as const,
    description: "Search mail with Gmail query operators.",
    params: ["query", "page_size", "page_token"],
  },
  {
    id: "get_gmail_message_content",
    tier: "Core" as const,
    description: "Get full message: subject, sender, body, attachments.",
    params: ["message_id"],
  },
  {
    id: "get_gmail_messages_content_batch",
    tier: "Core" as const,
    description: "Batch retrieve up to 25 messages.",
    params: ["message_ids"],
  },
  {
    id: "send_gmail_message",
    tier: "Core" as const,
    description: "Send email with replies, forwards, CC/BCC, attachments.",
    params: ["to", "subject", "body", "thread_id", "cc", "bcc"],
  },
  {
    id: "get_gmail_thread_content",
    tier: "Extended" as const,
    description: "Retrieve full conversation thread.",
    params: ["thread_id"],
  },
  {
    id: "get_gmail_threads_content_batch",
    tier: "Complete" as const,
    description: "Batch fetch thread content.",
    params: ["thread_ids"],
  },
  {
    id: "get_gmail_attachment_content",
    tier: "Extended" as const,
    description: "Download message attachments.",
    params: ["message_id", "attachment_id"],
  },
  {
    id: "draft_gmail_message",
    tier: "Extended" as const,
    description: "Create Gmail drafts with threading support.",
    params: ["to", "subject", "body", "thread_id"],
  },
  {
    id: "list_gmail_labels",
    tier: "Extended" as const,
    description: "List system and user labels.",
    params: [],
  },
  {
    id: "manage_gmail_label",
    tier: "Extended" as const,
    description: "Create, update, or delete labels.",
    params: ["action", "name", "label_id"],
  },
  {
    id: "modify_gmail_message_labels",
    tier: "Extended" as const,
    description: "Add or remove labels on a message.",
    params: ["message_id", "add_label_ids", "remove_label_ids"],
  },
  {
    id: "batch_modify_gmail_message_labels",
    tier: "Complete" as const,
    description: "Bulk label modifications.",
    params: ["message_ids", "add_label_ids", "remove_label_ids"],
  },
  {
    id: "list_gmail_filters",
    tier: "Extended" as const,
    description: "List configured Gmail filters.",
    params: [],
  },
  {
    id: "manage_gmail_filter",
    tier: "Extended" as const,
    description: "Create or delete Gmail filters.",
    params: ["action", "criteria", "action_config"],
  },
] as const;

export type GmailMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body: string;
  time: string;
  unread: boolean;
  labels: string[];
  hasAttachment?: boolean;
};

export const gmailAccount = "";

export const gmailInbox: GmailMessage[] = [];

export const gmailThreadMessages: Record<string, GmailMessage[]> = {};

export const gmailLabels: {
  id: string;
  name: string;
  type: "system" | "user";
  count: number;
}[] = [
  { id: "INBOX", name: "Inbox", type: "system", count: 0 },
  { id: "STARRED", name: "Starred", type: "system", count: 0 },
  { id: "SENT", name: "Sent", type: "system", count: 0 },
  { id: "DRAFT", name: "Drafts", type: "system", count: 0 },
  { id: "IMPORTANT", name: "Important", type: "system", count: 0 },
];

export const gmailFilters: {
  id: string;
  criteria: string;
  action: string;
}[] = [];

export const gmailDrafts: {
  id: string;
  to: string;
  subject: string;
  snippet: string;
}[] = [];
