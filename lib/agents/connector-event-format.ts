/**
 * Pure helpers for connector → Expert mail events (safe for node:test).
 */

export type MailSituationHeader = {
  providerMessageId: string;
  fromAddr?: string | null;
  toAddrs?: string[];
  subject?: string | null;
  snippet?: string | null;
  /** Full plain-text body when available — prefer over snippet. */
  bodyText?: string | null;
  receivedAt?: string | null;
  threadId?: string | null;
};

export function gmailEventIdempotencyKey(
  connectionId: string,
  providerMessageId: string,
): string {
  return `event:gmail:${connectionId}:${providerMessageId}`;
}

function formatSender(fromAddr: string | null | undefined): string {
  const raw = fromAddr?.trim();
  if (!raw) return "someone";
  return raw;
}

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso.trim();
  }
}

function messageBody(message: MailSituationHeader, maxChars = 2500): string {
  const full = message.bodyText?.trim();
  if (full) {
    const capped =
      full.length > maxChars
        ? `${full.slice(0, maxChars - 1).trimEnd()}…`
        : full;
    return capped;
  }
  const snippet = message.snippet?.trim();
  if (snippet) return snippet;
  return "(No message body available.)";
}

function formatThreadBlock(
  thread: MailSituationHeader[],
  latestId: string,
): string {
  const lines: string[] = [
    "Full email thread (oldest → newest):",
  ];
  for (const msg of thread) {
    const isLatest = msg.providerMessageId === latestId;
    const when = formatWhen(msg.receivedAt ?? null);
    lines.push("---");
    lines.push(
      `From: ${formatSender(msg.fromAddr)}${isLatest ? "  ← latest" : ""}`,
    );
    if (when) lines.push(`Received: ${when}`);
    lines.push("Message:");
    lines.push(messageBody(msg, thread.length > 4 ? 1800 : 2500));
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * Coworker-style situation Cander presents to an Expert.
 * Never includes Instructions, prompts, or implementation details.
 */
export function formatMailSituation(opts: {
  expertName?: string;
  message: MailSituationHeader;
  /** Prior + current messages in the thread, oldest → newest when provided. */
  threadMessages?: MailSituationHeader[];
}): string {
  const from = formatSender(opts.message.fromAddr);
  const subject = opts.message.subject?.trim();
  const when = formatWhen(opts.message.receivedAt ?? null);
  const to =
    opts.message.toAddrs?.map((a) => a.trim()).filter(Boolean).join(", ") ||
    null;

  const thread = (opts.threadMessages ?? []).filter(
    (m) => m.providerMessageId?.trim(),
  );
  const hasThread = thread.length > 1;
  const body = hasThread
    ? formatThreadBlock(thread, opts.message.providerMessageId)
    : [
        "Message:",
        (() => {
          const text = messageBody(opts.message);
          return text.includes("\n")
            ? text
            : `'${text.replace(/^['"]|['"]$/g, "")}'`;
        })(),
      ].join("\n");

  const greeting = opts.expertName
    ? `Hey ${opts.expertName}, ${from} just emailed us.`
    : `${from} just emailed us.`;

  const lines = [
    greeting,
    "",
    subject ? `Subject: ${subject}` : null,
    to ? `To: ${to}` : null,
    when ? `Received: ${when}` : null,
    !hasThread && opts.message.threadId?.trim()
      ? "This is part of an existing email thread."
      : null,
    subject || to || when || opts.message.threadId ? "" : null,
    body,
    "",
    "Ground your advice in what they actually wrote (including any day, time, or constraint they named).",
    "How should we handle this?",
  ].filter((line) => line !== null) as string[];

  return lines.join("\n");
}
