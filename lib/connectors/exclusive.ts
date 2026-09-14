import type { Connector } from "@/lib/types";
import { appConnectorById } from "@/lib/connectors/apps/definitions";

/** Cander-only apps (Exclusive catalog). */
export function isExclusiveConnector(item: Pick<Connector, "exclusive" | "category">) {
  return item.exclusive === true || item.category === "Exclusive";
}

/**
 * Connect/Install disabled — exclusive apps not ready yet, or Composio OAuth
 * pending custom auth config (e.g. Shopify).
 */
export function isConnectorComingSoon(
  item: Pick<Connector, "id" | "connectable">,
) {
  if (item.connectable === false) return true;
  return appConnectorById(item.id)?.oauthReady === false;
}
