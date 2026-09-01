/**
 * Composio webhook verification — server-only.
 * Uses @composio/core triggers.parse() per official contract:
 * HMAC-SHA256(webhookId.webhookTimestamp.payload) as v1,base64
 *
 * @see https://docs.composio.dev/reference/sdk-reference/typescript/triggers#parse
 * @see https://docs.composio.dev/reference/sdk-reference/typescript/triggers#verifywebhook
 */

import { Composio } from "@composio/core";

export type ComposioWebhookParsed = {
  eventId: string;
  connectedAccountId?: string;
  status?: string;
  composioUserId?: string;
  eventType?: string;
};

export type ComposioWebhookVerifyResult =
  | { ok: true; parsed: ComposioWebhookParsed }
  | { ok: false; error: string };

function headerValue(headers: Headers, name: string): string | null {
  return headers.get(name) ?? headers.get(name.toLowerCase());
}

export function extractConnectedAccountFields(
  rawPayload: unknown,
): Omit<ComposioWebhookParsed, "eventId"> {
  if (!rawPayload || typeof rawPayload !== "object") return {};
  const root = rawPayload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : null;
  const metadata =
    root.metadata && typeof root.metadata === "object"
      ? (root.metadata as Record<string, unknown>)
      : null;
  const connectedAccountId =
    (typeof data?.id === "string" ? data.id : undefined) ??
    (typeof data?.connected_account_id === "string"
      ? data.connected_account_id
      : undefined) ??
    (typeof metadata?.connected_account_id === "string"
      ? metadata.connected_account_id
      : undefined);
  const status =
    typeof data?.status === "string" ? data.status : undefined;
  const composioUserId =
    typeof data?.user_id === "string" ? data.user_id : undefined;
  const eventType = typeof root.type === "string" ? root.type : undefined;
  return { connectedAccountId, status, composioUserId, eventType };
}

export async function verifyComposioWebhook(input: {
  rawBody: string;
  headers: Headers;
  secret: string;
  apiKey?: string | null;
}): Promise<ComposioWebhookVerifyResult> {
  const eventId = headerValue(input.headers, "webhook-id")?.trim();
  const timestamp = headerValue(input.headers, "webhook-timestamp")?.trim();
  const signature = headerValue(input.headers, "webhook-signature")?.trim();

  if (!eventId || !timestamp || !signature) {
    return { ok: false, error: "Missing webhook signature headers." };
  }
  if (!input.secret) {
    return { ok: false, error: "Webhook not configured." };
  }

  try {
    const composio = new Composio({
      apiKey: input.apiKey?.trim() || "webhook-verify-only",
    });
    const result = await composio.triggers.parse(
      { body: input.rawBody, headers: input.headers },
      { verifySecret: input.secret },
    );
    const fields = extractConnectedAccountFields(result.rawPayload);
    return {
      ok: true,
      parsed: {
        eventId,
        ...fields,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("signature")) {
      return { ok: false, error: "Invalid webhook signature." };
    }
    if (message.includes("payload") || message.includes("timestamp")) {
      return { ok: false, error: "Invalid webhook payload." };
    }
    return { ok: false, error: "Invalid webhook." };
  }
}
