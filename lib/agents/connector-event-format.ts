/**
 * Pure helpers for connector → Expert mail events (safe for node:test).
 */

export type MailSituationHeader = {
  providerMessageId: string;
  fromAddr?: string | null;
  subject?: string | null;
  snippet?: string | null;
};

export function gmailEventIdempotencyKey(
  connectionId: string,
  providerMessageId: string,
): string {
  return `event:gmail:${connectionId}:${providerMessageId}`;
}

export function formatMailSituation(opts: {
  expertName?: string;
  message: MailSituationHeader;
}): string {
  const from = opts.message.fromAddr?.trim() || "a contact";
  const subject = opts.message.subject?.trim();
  const snippet = opts.message.snippet?.trim();
  const body = [
    subject ? `Subject: ${subject}` : null,
    snippet ? `"${snippet}"` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const greeting = opts.expertName
    ? `Hey ${opts.expertName}, we just received this email from ${from}:`
    : `We just received this email from ${from}:`;

  return [
    greeting,
    "",
    body || "(No subject or preview available.)",
    "",
    "How should we handle this?",
  ].join("\n");
}
