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

function messageBody(message: MailSituationHeader): string {
  const full = message.bodyText?.trim();
  if (full) {
    const capped =
      full.length > 3500 ? `${full.slice(0, 3497).trimEnd()}…` : full;
    return capped;
  }
  const snippet = message.snippet?.trim();
  if (snippet) return snippet;
  return "(No message body available.)";
}

/**
 * Coworker-style situation Cander presents to an Expert.
 * Never includes Instructions, prompts, or implementation details.
 */
export function formatMailSituation(opts: {
  expertName?: string;
  message: MailSituationHeader;
}): string {
  const from = formatSender(opts.message.fromAddr);
  const subject = opts.message.subject?.trim();
  const when = formatWhen(opts.message.receivedAt ?? null);
  const to =
    opts.message.toAddrs?.map((a) => a.trim()).filter(Boolean).join(", ") ||
    null;
  const body = messageBody(opts.message);
  const threadNote = opts.message.threadId?.trim()
    ? "This is part of an existing email thread."
    : null;

  const greeting = opts.expertName
    ? `Hey ${opts.expertName}, ${from} just emailed us.`
    : `${from} just emailed us.`;

  const lines = [
    greeting,
    "",
    subject ? `Subject: ${subject}` : null,
    to ? `To: ${to}` : null,
    when ? `Received: ${when}` : null,
    threadNote,
    subject || to || when || threadNote ? "" : null,
    "Message:",
    body.includes("\n") ? body : `'${body.replace(/^['"]|['"]$/g, "")}'`,
    "",
    "How should we handle this?",
  ].filter((line) => line !== null) as string[];

  return lines.join("\n");
}
