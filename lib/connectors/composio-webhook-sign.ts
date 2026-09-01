/**
 * Test-only helper: build official Composio v1 webhook signatures.
 * Signing input: `${webhookId}.${webhookTimestamp}.${payload}`
 * Header format: `v1,${base64(hmac-sha256)}`
 */

import { createHmac } from "crypto";

export function signComposioWebhook(input: {
  webhookId: string;
  webhookTimestamp: string;
  payload: string;
  secret: string;
}): string {
  const toSign = `${input.webhookId}.${input.webhookTimestamp}.${input.payload}`;
  const digest = createHmac("sha256", input.secret).update(toSign).digest("base64");
  return `v1,${digest}`;
}
