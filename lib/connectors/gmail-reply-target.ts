/**
 * Resolve the correct Gmail reply recipient / thread for connector execution.
 * Prevents replying to the connected mailbox itself (self-send).
 */

import { createSupabaseAdminClient } from "../supabase/admin.ts";

export function extractEmailAddress(
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) return null;
  const angle = raw.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  const bare = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return bare?.[0]?.trim().toLowerCase() ?? null;
}

export function emailsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = extractEmailAddress(a);
  const right = extractEmailAddress(b);
  return Boolean(left && right && left === right);
}

/**
 * For gmail.reply: pin thread + recipient to the inbound event / thread peer.
 * Never leave recipient as the connected inbox address.
 */
export async function normalizeGmailReplyArguments(opts: {
  connectionId: string;
  workspaceId: string;
  profileId: string;
  agentRunId?: string | null;
  args: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const admin = createSupabaseAdminClient();
  const next = { ...opts.args };

  let eventFrom: string | null = null;
  let eventThread: string | null = null;
  let eventMessageId: string | null = null;

  if (opts.agentRunId?.trim()) {
    const { data: run } = await admin
      .from("agent_runs")
      .select("trigger_payload")
      .eq("id", opts.agentRunId)
      .eq("workspace_id", opts.workspaceId)
      .maybeSingle();
    const payload =
      run?.trigger_payload && typeof run.trigger_payload === "object"
        ? (run.trigger_payload as Record<string, unknown>)
        : {};
    eventFrom =
      typeof payload.fromAddr === "string" ? payload.fromAddr : null;
    eventThread =
      typeof payload.threadId === "string" ? payload.threadId : null;
    eventMessageId =
      typeof payload.providerMessageId === "string"
        ? payload.providerMessageId
        : null;
  }

  if (eventThread?.trim()) {
    next.threadId = eventThread.trim();
  }

  const threadId = String(next.threadId ?? next.thread_id ?? "").trim();
  const { data: mailRows } = threadId
    ? await admin
        .from("connector_mail_messages")
        .select("from_addr, to_addrs, provider_message_id, received_at")
        .eq("connection_id", opts.connectionId)
        .eq("thread_id", threadId)
        .order("received_at", { ascending: false, nullsFirst: false })
        .limit(20)
    : { data: null as Array<Record<string, unknown>> | null };

  const selfEmails = new Set<string>();
  for (const row of mailRows ?? []) {
    const tos = Array.isArray(row.to_addrs) ? row.to_addrs : [];
    for (const to of tos) {
      const email = extractEmailAddress(String(to));
      if (email) selfEmails.add(email);
    }
  }

  // Prefer the inbound event sender, else the latest other-party From on the thread.
  let replyTo =
    extractEmailAddress(eventFrom) ||
    extractEmailAddress(
      typeof next.to === "string"
        ? next.to
        : typeof next.recipient_email === "string"
          ? next.recipient_email
          : null,
    );

  if (!replyTo || selfEmails.has(replyTo)) {
    for (const row of mailRows ?? []) {
      const from = extractEmailAddress(
        row.from_addr != null ? String(row.from_addr) : null,
      );
      if (from && !selfEmails.has(from)) {
        replyTo = from;
        break;
      }
    }
  }

  if (!replyTo && eventFrom) {
    replyTo = extractEmailAddress(eventFrom);
  }

  if (!replyTo) {
    throw new Error(
      "Could not resolve reply recipient for this Gmail thread. Refusing to send.",
    );
  }

  if (selfEmails.has(replyTo)) {
    throw new Error(
      `Refusing to reply to the connected mailbox itself (${replyTo}).`,
    );
  }

  next.to = replyTo;
  if (eventMessageId && !next.messageId && !next.message_id) {
    // Help providers that key off the specific message being answered.
    next.messageId = eventMessageId;
  }

  return next;
}

/** Test helper — no DB. */
export function chooseReplyRecipient(opts: {
  requestedTo?: string | null;
  eventFromAddr?: string | null;
  threadFromAddrs?: string[];
  selfEmails?: string[];
}): string | null {
  const self = new Set(
    (opts.selfEmails ?? [])
      .map((e) => extractEmailAddress(e))
      .filter(Boolean) as string[],
  );
  const requested = extractEmailAddress(opts.requestedTo);
  if (requested && !self.has(requested)) return requested;
  const event = extractEmailAddress(opts.eventFromAddr);
  if (event && !self.has(event)) return event;
  for (const raw of opts.threadFromAddrs ?? []) {
    const email = extractEmailAddress(raw);
    if (email && !self.has(email)) return email;
  }
  return null;
}
