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

export const gmailAccount = "matthew@acme.com";

export const gmailInbox: GmailMessage[] = [
  {
    id: "msg-2401",
    threadId: "thr-8801",
    from: "Jordan Lee <jordan@northstar.io>",
    to: "matthew@acme.com",
    subject: "Q3 partnership deck — ready for review",
    snippet:
      "Attached the latest deck with pricing options. Can we sync Thursday?",
    body: "Hi Matthew,\n\nAttached the latest deck with pricing options A/B and the proposed rollout. Can we sync Thursday afternoon?\n\nThanks,\nJordan",
    time: "10:42 AM",
    unread: true,
    labels: ["INBOX", "IMPORTANT"],
    hasAttachment: true,
  },
  {
    id: "msg-2398",
    threadId: "thr-8794",
    from: "Acme Billing <billing@acme.com>",
    to: "matthew@acme.com",
    subject: "Invoice #4821 is ready",
    snippet: "Your August invoice is available. Due date: Aug 28.",
    body: "Your August invoice (#4821) is ready.\n\nAmount due: $4,200.00\nDue date: Aug 28, 2026\n\nView invoice in the billing portal.",
    time: "9:15 AM",
    unread: true,
    labels: ["INBOX", "Finance"],
  },
  {
    id: "msg-2388",
    threadId: "thr-8770",
    from: "Maya Chen <maya@helio.dev>",
    to: "matthew@acme.com",
    subject: "Re: Intro to Leah",
    snippet: "Great meeting Leah — we'll follow up with a pilot proposal next week.",
    body: "Matthew,\n\nGreat meeting Leah. We'll follow up with a pilot proposal next week covering scope, timeline, and success metrics.\n\nMaya",
    time: "Yesterday",
    unread: false,
    labels: ["INBOX"],
  },
  {
    id: "msg-2371",
    threadId: "thr-8742",
    from: "GitHub <noreply@github.com>",
    to: "matthew@acme.com",
    subject: "[acme-inc/courier] PR #412 ready for review",
    snippet: "mattxgross requested your review on pull request #412.",
    body: "mattxgross requested your review on pull request #412:\n\nfeat: Handshake control center\n\nView pull request on GitHub.",
    time: "Yesterday",
    unread: false,
    labels: ["INBOX", "Engineering"],
  },
  {
    id: "msg-2355",
    threadId: "thr-8710",
    from: "Sarah Kim <sarah@acme.com>",
    to: "matthew@acme.com",
    subject: "Weekly standup notes",
    snippet: "Notes from Monday standup — action items highlighted.",
    body: "Notes from Monday standup:\n\n1. Ship Handshake prototype\n2. Confirm Gmail connector pin UX\n3. Review hosting pricing copy\n\nAction items highlighted in the doc.",
    time: "Mon",
    unread: false,
    labels: ["INBOX"],
  },
];

export const gmailThreadMessages: Record<string, GmailMessage[]> = {
  "thr-8801": [
    gmailInbox[0],
    {
      id: "msg-2400",
      threadId: "thr-8801",
      from: "Matthew <matthew@acme.com>",
      to: "jordan@northstar.io",
      subject: "Re: Q3 partnership deck — ready for review",
      snippet: "Thanks — Thursday 2pm works. Sending a calendar hold.",
      body: "Thanks Jordan — Thursday 2pm works. Sending a calendar hold.\n\nMatthew",
      time: "10:55 AM",
      unread: false,
      labels: ["SENT"],
    },
  ],
  "thr-8794": [gmailInbox[1]],
  "thr-8770": [gmailInbox[2]],
  "thr-8742": [gmailInbox[3]],
  "thr-8710": [gmailInbox[4]],
};

export const gmailLabels = [
  { id: "INBOX", name: "Inbox", type: "system" as const, count: 42 },
  { id: "STARRED", name: "Starred", type: "system" as const, count: 6 },
  { id: "SENT", name: "Sent", type: "system" as const, count: 318 },
  { id: "DRAFT", name: "Drafts", type: "system" as const, count: 3 },
  { id: "IMPORTANT", name: "Important", type: "system" as const, count: 11 },
  { id: "Finance", name: "Finance", type: "user" as const, count: 18 },
  { id: "Engineering", name: "Engineering", type: "user" as const, count: 54 },
  { id: "Partners", name: "Partners", type: "user" as const, count: 9 },
];

export const gmailFilters = [
  {
    id: "flt-1",
    criteria: "from:billing@acme.com",
    action: "Apply label Finance · Skip inbox",
  },
  {
    id: "flt-2",
    criteria: "from:noreply@github.com",
    action: "Apply label Engineering",
  },
  {
    id: "flt-3",
    criteria: "subject:invoice",
    action: "Apply label Finance · Mark important",
  },
];

export const gmailDrafts = [
  {
    id: "dr-1",
    to: "leah@northstar.io",
    subject: "Pilot proposal follow-up",
    snippet: "Sharing the scoped pilot for Helio × Acme…",
  },
];
