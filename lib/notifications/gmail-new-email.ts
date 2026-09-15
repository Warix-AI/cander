/**
 * Gmail → createNotification (no platform delivery logic).
 */

import { createNotification } from "./create-notification.ts";
import { GMAIL_NEW_EMAIL_TYPE } from "./types.ts";
import { gmailNotificationRoute } from "./resolve-notification-route.ts";
import type { SyncMessageHeader } from "@/lib/connectors/sdk/types";

function senderTitle(fromAddr?: string | null): string {
  const raw = (fromAddr || "").trim();
  if (!raw) return "New email";
  const angled = raw.match(/^([^<]+)</);
  if (angled?.[1]?.trim()) return angled[1].trim().slice(0, 80);
  return raw.slice(0, 80);
}

function looksLikeSelfSend(
  fromAddr: string | null | undefined,
  selfEmails: Set<string>,
): boolean {
  if (!fromAddr || selfEmails.size === 0) return false;
  const m = fromAddr.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = m?.[0]?.toLowerCase();
  return Boolean(email && selfEmails.has(email));
}

export async function notifyNewGmailMessages(opts: {
  workspaceId: string;
  profileId: string;
  connectionId: string;
  messages: SyncMessageHeader[];
  /** Skip notify until sync has been armed (avoids backfill storms). */
  armedAt: string | null;
  selfEmails?: string[];
}): Promise<void> {
  if (!opts.messages.length) return;
  const self = new Set(
    (opts.selfEmails ?? []).map((e) => e.toLowerCase()).filter(Boolean),
  );
  const armedMs = opts.armedAt ? Date.parse(opts.armedAt) : NaN;
  const batch = opts.messages.slice(0, 5);

  for (const message of batch) {
    if (looksLikeSelfSend(message.fromAddr, self)) continue;
    if (
      Number.isFinite(armedMs) &&
      message.receivedAt &&
      Date.parse(message.receivedAt) < armedMs
    ) {
      continue;
    }
    // Cold start / first arm: only notify if armedAt is set.
    if (!opts.armedAt) continue;

    const threadId = message.threadId?.trim() || null;
    const title = senderTitle(message.fromAddr);
    const body = (message.snippet || message.subject || "New email")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);

    try {
      await createNotification({
        profileId: opts.profileId,
        workspaceId: opts.workspaceId,
        type: GMAIL_NEW_EMAIL_TYPE,
        title,
        body,
        connector: "gmail",
        connectionId: opts.connectionId,
        resourceType: "gmail_thread",
        resourceId: threadId || message.providerMessageId,
        route: gmailNotificationRoute({
          connectionId: opts.connectionId,
          threadId,
          messageId: message.providerMessageId,
        }),
        metadata: {
          threadId,
          messageId: message.providerMessageId,
          subject: message.subject ?? null,
        },
        dedupeKey: `gmail:${opts.connectionId}:${message.providerMessageId}`,
      });
    } catch (err) {
      console.warn(
        "[notifications] gmail notify failed",
        err instanceof Error ? err.message : err,
      );
    }
  }
}
