/**
 * Connector provider factory — returns noop until Composio phase.
 * Future: COMPOSIO_API_KEY enables composio-adapter.
 */

import { noopConnectorProvider } from "./noop-provider.ts";
import type { ConnectorProviderAdapter } from "./types.ts";

export function getConnectorProvider(): ConnectorProviderAdapter {
  return noopConnectorProvider;
}
