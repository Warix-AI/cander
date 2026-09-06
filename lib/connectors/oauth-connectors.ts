/**
 * Connectors that use Composio OAuth (server initiate + auth config env).
 * Keep in sync with `initiateConnection` allowlist in lifecycle.ts.
 */

import { APP_OAUTH_CONNECTOR_IDS } from "./apps/definitions.ts";

export const OAUTH_CONNECTOR_IDS = [
  "gmail",
  "gcal",
  "gdrive",
  "gsheets",
  "gdocs",
  ...APP_OAUTH_CONNECTOR_IDS,
] as const;

export type OauthConnectorId = (typeof OAUTH_CONNECTOR_IDS)[number];

export function isOauthConnectorId(id: string): id is OauthConnectorId {
  return (OAUTH_CONNECTOR_IDS as readonly string[]).includes(id);
}
