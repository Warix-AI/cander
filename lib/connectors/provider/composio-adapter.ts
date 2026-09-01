/**
 * Composio provider adapter — server-only.
 */

import type { ConnectorProviderAdapter } from "./types.ts";
import {
  completeComposioAuth,
  createConnectLink,
  getComposioConnectedAccount,
  isComposioConfigured,
  revokeComposioConnectedAccount,
} from "../composio-http.ts";
import { composioUserId } from "../composio-identity.ts";
import { verifyComposioWebhook } from "../composio-webhook.ts";

export const composioProviderAdapter: ConnectorProviderAdapter = {
  name: "composio",

  async beginAuthorization(input) {
    if (!isComposioConfigured()) {
      return { ok: false, error: "Composio is not configured." };
    }
    if (input.connectorId !== "gmail") {
      return { ok: false, error: "Connector not available." };
    }
    try {
      const userId = composioUserId(input.workspaceId, input.ownerId);
      const link = await createConnectLink({
        composioUserId: userId,
        connectorId: input.connectorId,
      });
      return {
        ok: true,
        authorizationUrl: link.redirectUrl,
        linkSessionRef: link.connectedAccountId,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not start authorization.";
      return { ok: false, error: message };
    }
  },

  async completeCallbackVerification(input) {
    if (!isComposioConfigured()) {
      return { ok: false, error: "Composio is not configured." };
    }
    try {
      const result = await completeComposioAuth({
        sessionUri: input.sessionUri,
        composioUserId: input.composioUserId,
      });
      if (result.status !== "ACTIVE" && result.status !== "active") {
        return {
          ok: false,
          error: "Connection not active.",
          failureDetail: "Provider did not confirm active status.",
        };
      }
      if (
        input.expectedLinkSessionRef &&
        result.connectedAccountId !== input.expectedLinkSessionRef
      ) {
        return {
          ok: false,
          error: "Connection could not be verified.",
          failureDetail: "Provider connection mismatch.",
        };
      }
      return {
        ok: true,
        providerConnectionId: result.connectedAccountId,
        toolkitSlug: result.toolkitSlug,
      };
    } catch {
      return { ok: false, error: "Authorization could not be verified." };
    }
  },

  async reconcileConnection(input) {
    return this.getStatus({ providerConnectionId: input.providerConnectionId });
  },

  async getStatus(input) {
    if (!isComposioConfigured()) {
      return { ok: false, error: "Composio is not configured." };
    }
    try {
      const account = await getComposioConnectedAccount(input.providerConnectionId);
      const normalized =
        account.status === "ACTIVE" || account.status === "active"
          ? "active"
          : account.status === "FAILED" || account.status === "failed"
            ? "failed"
            : account.status === "DISCONNECTED" ||
                account.status === "disconnected" ||
                account.status === "INACTIVE"
              ? "disconnected"
              : "pending";
      return {
        ok: true,
        status: normalized,
        providerConnectionId: input.providerConnectionId,
      };
    } catch {
      return { ok: false, error: "Could not load provider status." };
    }
  },

  async disconnect(input) {
    if (!isComposioConfigured()) {
      return { ok: false, error: "Composio is not configured." };
    }
    const result = await revokeComposioConnectedAccount(input.providerConnectionId);
    if (!result.ok) {
      return { ok: false, error: "Provider disconnect failed." };
    }
    return { ok: true };
  },

  async verifyWebhook(input) {
    const secret = process.env.COMPOSIO_WEBHOOK_SECRET?.trim();
    if (!secret) {
      return { ok: false, error: "Webhook not configured." };
    }
    const verified = await verifyComposioWebhook({
      rawBody: input.rawBody,
      headers: input.headers,
      secret,
      apiKey: process.env.COMPOSIO_API_KEY,
    });
    if (!verified.ok) {
      return { ok: false, error: verified.error };
    }
    return {
      ok: true,
      eventId: verified.parsed.eventId,
      connectedAccountId: verified.parsed.connectedAccountId,
      status: verified.parsed.status,
      composioUserId: verified.parsed.composioUserId,
      eventType: verified.parsed.eventType,
    };
  },
};
