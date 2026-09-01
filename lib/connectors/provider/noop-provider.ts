/**
 * No-op connector provider — no network, no credentials.
 */

import type { ConnectorProviderAdapter } from "./types.ts";

const NOT_CONFIGURED = "Connector provider is not configured.";

export const noopConnectorProvider: ConnectorProviderAdapter = {
  name: "noop",
  async beginAuthorization() {
    return { ok: false, error: NOT_CONFIGURED };
  },
  async reconcileConnection() {
    return { ok: false, error: NOT_CONFIGURED };
  },
  async getStatus() {
    return { ok: false, error: NOT_CONFIGURED };
  },
  async disconnect() {
    return { ok: false, error: NOT_CONFIGURED };
  },
  async verifyWebhook() {
    return { ok: false, error: NOT_CONFIGURED };
  },
};
