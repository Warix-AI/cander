/**
 * Composio Gmail tool mapping and response redaction — server-only.
 */

export type GmailConnectorToolName =
  | "gmail.search"
  | "gmail.read"
  | "gmail.send"
  | "gmail.draft"
  | "gmail.reply"
  | "gmail.archive"
  | "gmail.markRead"
  | "gmail.markUnread";

export const GMAIL_COMPOSIO_SLUGS: Record<GmailConnectorToolName, string> = {
  "gmail.search": "GMAIL_FETCH_EMAILS",
  "gmail.read": "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
  "gmail.send": "GMAIL_SEND_EMAIL",
  "gmail.draft": "GMAIL_CREATE_EMAIL_DRAFT",
  "gmail.reply": "GMAIL_REPLY_TO_THREAD",
  // Label mutations — used by ConnectorOperations (UI), not agent-required.
  "gmail.archive": "GMAIL_REMOVE_LABEL",
  "gmail.markRead": "GMAIL_REMOVE_LABEL",
  "gmail.markUnread": "GMAIL_ADD_LABEL_TO_EMAIL",
};

const SECRET_KEYS = new Set([
  "access_token",
  "refresh_token",
  "token",
  "provider_connection_id",
  "connected_account_id",
  "link_session_ref",
]);

const MAX_BODY_CHARS = 8_000;
const MAX_HTML_CHARS = 200_000;
const MAX_SNIPPET_CHARS = 500;
const LONG_HTML_KEYS = new Set([
  "html",
  "bodyHtml",
  "body_html",
  "bodyHtmlContent",
]);


export function mapGmailToolArguments(
  tool: GmailConnectorToolName,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (tool === "gmail.search") {
    const query = String(args.query ?? "").trim();
    if (!query) throw new Error("Missing required argument: query");
    const rawMax = args.maxResults ?? args.max_results ?? 10;
    const maxResults = Math.min(25, Math.max(1, Number(rawMax) || 10));
    return { query, max_results: maxResults };
  }

  if (tool === "gmail.read") {
    const messageId = args.messageId ?? args.message_id;
    if (!messageId) throw new Error("Missing required argument: messageId");
    return { message_id: String(messageId), format: "full" };
  }

  if (tool === "gmail.archive") {
    const messageId = args.messageId ?? args.message_id;
    if (!messageId) throw new Error("Missing required argument: messageId");
    return {
      message_id: String(messageId),
      label_name: "INBOX",
    };
  }

  if (tool === "gmail.markRead") {
    const messageId = args.messageId ?? args.message_id;
    if (!messageId) throw new Error("Missing required argument: messageId");
    return {
      message_id: String(messageId),
      label_name: "UNREAD",
    };
  }

  if (tool === "gmail.markUnread") {
    const messageId = args.messageId ?? args.message_id;
    if (!messageId) throw new Error("Missing required argument: messageId");
    return {
      message_id: String(messageId),
      label_ids: ["UNREAD"],
    };
  }

  if (tool === "gmail.reply") {
    const threadId = args.threadId ?? args.thread_id;
    if (!threadId) throw new Error("Missing required argument: threadId");
    const messageBody =
      args.body != null
        ? String(args.body)
        : args.message_body != null
          ? String(args.message_body)
          : args.messageBody != null
            ? String(args.messageBody)
            : "";
    if (!messageBody.trim()) {
      throw new Error("Missing required argument: body");
    }
    const out: Record<string, unknown> = {
      thread_id: String(threadId),
      message_body: messageBody,
    };
    const recipient =
      args.to ?? args.recipient_email ?? args.recipientEmail ?? args.recipient;
    if (recipient) out.recipient_email = String(recipient).trim();
    if (args.cc) out.cc = args.cc;
    if (args.bcc) out.bcc = args.bcc;
    if (args.isHtml === true || args.is_html === true) out.is_html = true;
    return out;
  }

  if (tool === "gmail.draft") {
    const out: Record<string, unknown> = {};
    const to =
      args.to ??
      args.recipientEmail ??
      args.recipient_email ??
      args.recipient;
    if (to) out.recipient_email = String(to).trim();
    if (args.subject != null) out.subject = String(args.subject);
    if (args.body != null) {
      out.body = String(args.body);
    } else if (args.message != null) {
      out.body = String(args.message);
    }
    const threadId = args.threadId ?? args.thread_id;
    if (threadId) out.thread_id = String(threadId);
    if (args.cc) out.cc = args.cc;
    if (args.bcc) out.bcc = args.bcc;
    if (args.isHtml === true || args.is_html === true) out.is_html = true;
    if (!out.recipient_email && !out.subject && !out.body && !out.thread_id) {
      throw new Error("Provide at least a recipient, subject, body, or thread.");
    }
    return out;
  }

  const to =
    args.to ??
    args.recipientEmail ??
    args.recipient_email ??
    args.recipient;
  if (!to || !String(to).trim()) {
    throw new Error("Missing required argument: to");
  }
  const subject = args.subject != null ? String(args.subject) : "";
  const body =
    args.body != null
      ? String(args.body)
      : args.message != null
        ? String(args.message)
        : "";
  if (!subject.trim() && !body.trim()) {
    throw new Error("Provide at least a subject or body.");
  }

  const out: Record<string, unknown> = {
    recipient_email: String(to).trim(),
    subject,
    body,
  };
  if (args.cc) out.cc = String(args.cc);
  if (args.bcc) out.bcc = String(args.bcc);
  if (args.isHtml === true || args.is_html === true) out.is_html = true;
  return out;
}

export function redactComposioPayload(value: unknown, keyHint = ""): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactComposioPayload(item, keyHint));
  }
  if (typeof value !== "object") {
    if (typeof value === "string") {
      const max = LONG_HTML_KEYS.has(keyHint) ? MAX_HTML_CHARS : MAX_BODY_CHARS;
      if (value.length > max) return `${value.slice(0, max)}…`;
    }
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(key)) continue;
    out[key] = redactComposioPayload(child, key);
  }
  return out;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function headerValue(headers: unknown, name: string): string | undefined {
  if (!Array.isArray(headers)) return undefined;
  const lower = name.toLowerCase();
  for (const header of headers) {
    if (!header || typeof header !== "object") continue;
    const row = header as Record<string, unknown>;
    const headerName = pickString(row.name, row.key)?.toLowerCase();
    if (headerName === lower) {
      return pickString(row.value);
    }
  }
  return undefined;
}

function decodeGmailBase64(data: string): string | undefined {
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${pad}`, "base64").toString("utf8");
  } catch {
    return undefined;
  }
}

function collectMimeBodies(
  node: Record<string, unknown> | null | undefined,
  out: { text?: string; html?: string },
) {
  if (!node) return;
  const mime = pickString(node.mimeType, node.mime_type)?.toLowerCase() ?? "";
  const body = node.body;
  const bodyObj =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;
  const data = pickString(bodyObj?.data);
  if (data) {
    const decoded = decodeGmailBase64(data);
    if (decoded) {
      if (mime.includes("text/html") && !out.html) out.html = decoded;
      if (mime.includes("text/plain") && !out.text) out.text = decoded;
    }
  }
  const parts = node.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      if (part && typeof part === "object") {
        collectMimeBodies(part as Record<string, unknown>, out);
      }
    }
  }
}

function extractMessageSummary(message: Record<string, unknown>): Record<string, unknown> {
  const payload = message.payload;
  const payloadObj =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  const headers = payloadObj?.headers ?? message.headers;

  const subject = headerValue(headers, "Subject") ?? pickString(message.subject);
  const from = headerValue(headers, "From") ?? pickString(message.from);
  const to = headerValue(headers, "To") ?? pickString(message.to);
  const date = headerValue(headers, "Date") ?? pickString(message.date, message.internalDate);

  const mimeBodies: { text?: string; html?: string } = {};
  if (payloadObj) collectMimeBodies(payloadObj, mimeBodies);
  // Some Composio responses already flatten bodies onto the message.
  collectMimeBodies(message, mimeBodies);

  const body =
    pickString(message.body, message.text, mimeBodies.text, message.snippet) ??
    mimeBodies.text;
  const html =
    pickString(
      message.html,
      message.bodyHtml,
      message.body_html,
      mimeBodies.html,
    ) ?? mimeBodies.html;

  const snippet = pickString(message.snippet);
  const trimmedBody =
    body && body.length > MAX_BODY_CHARS
      ? `${body.slice(0, MAX_BODY_CHARS)}…`
      : body;
  const trimmedHtml =
    html && html.length > MAX_HTML_CHARS
      ? `${html.slice(0, MAX_HTML_CHARS)}…`
      : html;
  const trimmedSnippet =
    snippet && snippet.length > MAX_SNIPPET_CHARS
      ? `${snippet.slice(0, MAX_SNIPPET_CHARS)}…`
      : snippet;

  return {
    id: pickString(message.id, message.messageId, message.message_id),
    threadId: pickString(message.threadId, message.thread_id),
    subject,
    from,
    to,
    date,
    snippet: trimmedSnippet,
    body: trimmedBody,
    html: trimmedHtml,
    labelIds: Array.isArray(message.labelIds)
      ? message.labelIds
      : Array.isArray(message.label_ids)
        ? message.label_ids
        : undefined,
  };
}

function unwrapComposioData(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  if (obj.data != null) return obj.data;
  if (obj.response_data != null) return obj.response_data;
  return raw;
}

export function formatGmailToolOutput(
  tool: GmailConnectorToolName,
  raw: unknown,
): string {
  // Unwrap first — do NOT redact before MIME decode or base64 HTML parts get truncated.
  const data = unwrapComposioData(raw);

  if (tool === "gmail.search") {
    const messages = extractSearchMessages(data).map((row) => {
      const { html: _html, ...rest } = row;
      return rest;
    });
    const summary = {
      outcome: "ok",
      count: messages.length,
      messages,
    };
    return JSON.stringify(redactComposioPayload(summary));
  }

  if (tool === "gmail.send") {
    const sent =
      data && typeof data === "object"
        ? (data as Record<string, unknown>)
        : { result: data };
    return JSON.stringify(
      redactComposioPayload({
        outcome: "ok",
        sent: {
          id: pickString(sent.id, sent.messageId, sent.message_id),
          threadId: pickString(sent.threadId, sent.thread_id),
        },
      }),
    );
  }

  if (tool === "gmail.draft" || tool === "gmail.reply") {
    const payload =
      data && typeof data === "object"
        ? (data as Record<string, unknown>)
        : { result: data };
    return JSON.stringify(
      redactComposioPayload({
        outcome: "ok",
        [tool === "gmail.draft" ? "draft" : "reply"]: {
          id: pickString(
            payload.id,
            payload.draftId,
            payload.draft_id,
            payload.messageId,
            payload.message_id,
          ),
          threadId: pickString(payload.threadId, payload.thread_id),
        },
      }),
    );
  }

  // gmail.read — extract HTML/text from full MIME before any truncation.
  let messageSource: Record<string, unknown> | null =
    data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (
    messageSource?.message &&
    typeof messageSource.message === "object" &&
    !messageSource.payload
  ) {
    messageSource = messageSource.message as Record<string, unknown>;
  }
  const message = messageSource
    ? extractMessageSummary(messageSource)
    : { body: String(data ?? "") };
  return JSON.stringify({ outcome: "ok", message });
}

function extractSearchMessages(data: unknown): Record<string, unknown>[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => extractMessageSummary(item));
  }
  if (typeof data !== "object") return [];

  const obj = data as Record<string, unknown>;
  const candidates = [
    obj.messages,
    obj.emails,
    obj.items,
    obj.results,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => extractMessageSummary(item));
    }
  }

  if (obj.message && typeof obj.message === "object") {
    return [extractMessageSummary(obj.message as Record<string, unknown>)];
  }

  return [];
}
