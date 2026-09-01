/**
 * Connector provider factory — Composio when configured, else noop.
 */

import { isComposioConfigured } from "../composio-http.ts";
import { composioProviderAdapter } from "./composio-adapter.ts";
import { noopConnectorProvider } from "./noop-provider.ts";
import type { ConnectorProviderAdapter } from "./types.ts";

export function getConnectorProvider(): ConnectorProviderAdapter {
  if (isComposioConfigured()) return composioProviderAdapter;
  return noopConnectorProvider;
}
