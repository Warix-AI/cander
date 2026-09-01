"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import {
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/SettingsChrome";
import {
  connectionsForConnectorLive,
  subscribeConnectorConnections,
  getConnectorConnectionsSnapshot,
} from "@/lib/connector-connections-store";
import { connectorsAvailableForKind } from "@/lib/workspace-connections";
import { useSpaceMutation } from "@/lib/hooks/use-space-query";
import { workspaceKindLabel, workspaceKindOf } from "@/lib/workspace-kind";
import { getDataBackend } from "@/lib/data-backend";
import {
  addWorkspaceConnection,
  connectionsForConnector,
  removeWorkspaceConnection,
  subscribeWorkspaceConnections,
  getWorkspaceConnectionsSnapshot,
} from "@/lib/workspace-connections";
import { useSyncExternalStore } from "react";

function useConnectionRevision(local: boolean) {
  useSyncExternalStore(
    local ? subscribeWorkspaceConnections : subscribeConnectorConnections,
    () => (local ? getWorkspaceConnectionsSnapshot() : getConnectorConnectionsSnapshot()),
  );
}

export function ConnectorsSettings() {
  const { workspaceId, workspace } = useApp();
  const { connectConnector, disconnectConnectorConnection } = useSpaceMutation();
  const isLocal = getDataBackend() === "local";

  useConnectionRevision(isLocal);

  const kind = workspaceKindOf(workspace);
  const catalog = useMemo(() => connectorsAvailableForKind(kind), [kind]);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <SettingsPage>
      <SettingsHeader
        title="Connectors"
        subtitle="Connections live on this workspace only. Switch workspaces in the rail to manage a different set."
        actions={
          <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[12px]">
            <span className="font-medium tracking-[-0.01em]">
              {workspace.name}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {workspaceKindLabel(kind)}
            </span>
          </div>
        }
      />

      <SettingsSection
        title="Apps"
        description="Each connector supports one live personal connection per workspace."
        className="mt-8"
      >
        <div className="space-y-3">
          {catalog.map((item) => {
            const localAccounts = isLocal
              ? connectionsForConnector(workspaceId, item.id, workspace)
              : [];
            const liveConnections = isLocal
              ? []
              : connectionsForConnectorLive(workspaceId, item.id).filter(
                  (row) => row.status === "pending" || row.status === "active",
                );

            const summary = isLocal
              ? localAccounts.length
                ? `${localAccounts.length} connection${localAccounts.length === 1 ? "" : "s"}`
                : "Not connected"
              : liveConnections.length
                ? liveConnections[0]?.status === "pending"
                  ? "Connection pending"
                  : "Connected"
                : "Not connected";

            const hasConnection = isLocal
              ? localAccounts.length > 0
              : liveConnections.length > 0;

            return (
              <SettingsGroup key={item.id}>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <ConnectorMark id={item.icon} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium tracking-[-0.01em]">
                      {item.name}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                      {summary}
                    </p>
                  </div>
                  {!hasConnection ? (
                    <button
                      type="button"
                      disabled={busy === item.id}
                      onClick={async () => {
                        setBusy(item.id);
                        try {
                          if (isLocal) {
                            addWorkspaceConnection(
                              workspaceId,
                              item.id,
                              kind === "personal"
                                ? "Personal account"
                                : "Work account",
                              workspace,
                            );
                          } else {
                            await connectConnector(item.id);
                          }
                        } finally {
                          setBusy(null);
                        }
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/15 px-3 text-[12.5px] font-medium tracking-[-0.01em] hover:bg-muted disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={1.7} />
                      Connect
                    </button>
                  ) : null}
                </div>

                {isLocal
                  ? localAccounts.map((account) => (
                      <SettingsRow
                        key={account.id}
                        label={account.label}
                        description={
                          account.status === "connected"
                            ? "Connected"
                            : account.status
                        }
                      >
                        <button
                          type="button"
                          aria-label={`Remove ${account.label}`}
                          disabled={busy === account.id}
                          onClick={() => {
                            setBusy(account.id);
                            removeWorkspaceConnection(
                              workspaceId,
                              item.id,
                              account.id,
                              workspace,
                            );
                            setBusy(null);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                        </button>
                      </SettingsRow>
                    ))
                  : liveConnections.map((connection) => (
                      <SettingsRow
                        key={connection.id}
                        label={item.name}
                        description={
                          connection.status === "pending"
                            ? "Pending provider setup"
                            : "Connected"
                        }
                      >
                        <button
                          type="button"
                          aria-label={`Disconnect ${item.name}`}
                          disabled={busy === connection.id}
                          onClick={async () => {
                            setBusy(connection.id);
                            try {
                              await disconnectConnectorConnection(connection.id);
                            } finally {
                              setBusy(null);
                            }
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                        </button>
                      </SettingsRow>
                    ))}
              </SettingsGroup>
            );
          })}
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
