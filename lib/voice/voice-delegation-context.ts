/**
 * Mirror chat ambient focus + connector account scoping for Live voice turns.
 * Without selectedConnectionIds, agent-turn stays on raw chat (title only, no gdocs.get).
 */

import { getActiveBrowserContextTab } from "@/lib/browser-context/active-tab";
import { refersToActiveBrowserSurface } from "@/lib/browser-context/routing";
import { resolveActiveConnectorAccount } from "@/lib/connector-active-account";
import { connectionsForConnectorLive } from "@/lib/connector-connections-store";
import {
  buildAmbientFocusToolContext,
  getConnectorFocusSnapshot,
} from "@/lib/connector-focus";
import { isUiConnectedStatus } from "@/lib/connectors/authz";
import { VOICE_DELEGATION_SYSTEM } from "@/lib/voice/realtime-tools";

export type VoiceDelegationTurnContext = {
  selectedConnectionId: string | null;
  selectedConnectionIds: string[];
  projectId: string | null;
  systemContent: string;
  /** True when the ask is about the visible browser/page and needs client read. */
  needsBrowserPreflight: boolean;
  connectorId: string | null;
  focusedItemId: string | null;
  /** Human label for the focused item or connector (for spoken progress). */
  focusedTitle: string | null;
  connectorLabel: string | null;
};

export function prepareVoiceDelegationTurn(opts: {
  workspaceId: string;
  requestText: string;
}): VoiceDelegationTurnContext {
  const focus = getConnectorFocusSnapshot();
  const connectorId = focus?.connectorId?.trim() || null;
  const focusedItemId = focus?.itemId?.trim() || null;
  const focusedTitle =
    focus?.itemTitle?.trim() ||
    focus?.connectorLabel?.trim() ||
    null;
  const connectorLabel = focus?.connectorLabel?.trim() || null;

  let selectedConnectionId: string | null = null;
  const selectedConnectionIds: string[] = [];

  if (connectorId) {
    const live = connectionsForConnectorLive(
      opts.workspaceId,
      connectorId,
    ).filter((row) => isUiConnectedStatus(row.status));
    const active = resolveActiveConnectorAccount(
      opts.workspaceId,
      connectorId,
      live,
      isUiConnectedStatus,
    );
    if (active) {
      selectedConnectionId = active.id;
      selectedConnectionIds.push(active.id);
    }
  }

  const ambient = buildAmbientFocusToolContext().trim();
  const systemContent = [VOICE_DELEGATION_SYSTEM, ambient]
    .filter(Boolean)
    .join("\n\n");

  const projectId = getActiveBrowserContextTab()?.projectId?.trim() || null;

  return {
    selectedConnectionId,
    selectedConnectionIds,
    projectId,
    systemContent,
    needsBrowserPreflight: refersToActiveBrowserSurface(opts.requestText),
    connectorId,
    focusedItemId,
    focusedTitle,
    connectorLabel,
  };
}
