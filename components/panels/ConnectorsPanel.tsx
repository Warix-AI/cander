"use client";

import { useMemo, useSyncExternalStore, useState } from "react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import { PanelChrome } from "@/components/panels/PanelChrome";
import { ProjectsBrowser } from "@/components/panels/ProjectsBrowser";
import { Row, SectionLabel } from "@/components/panels/Bits";
import { connectors } from "@/lib/data";
import {
  useSpaceAttachments,
  useSpaceProjects,
} from "@/lib/hooks/use-space-query";
import { cn } from "@/lib/utils";
import { SHELL_PANEL_BODY } from "@/lib/shell-chrome";
import { blockedConnectorIds } from "@/lib/workspace-policy";
import {
  activeAccountsForConnector,
  connectionsForConnectorLive,
  getConnectorConnectionsServerSnapshot,
  getConnectorConnectionsSnapshot,
  subscribeConnectorConnections,
} from "@/lib/connector-connections-store";
import { ConnectorToolPermissions } from "@/components/connectors/ConnectorToolPermissions";
import {
  fetchConnectorConnections,
  initiateConnectorConnection,
  disconnectConnectorConnection,
} from "@/lib/api/connector-client";
import { replaceConnectorConnectionsForWorkspace } from "@/lib/connector-connections-store";
import { detachWorkConnector } from "@/lib/work-connectors";

export function ConnectorsPanel() {
  const {
    connectorId,
    openConnector,
    openProject,
    workspaceId,
    workspace,
    workspacePolicies,
    panelIntent,
    billingPlan,
  } = useApp();
  const [connectError, setConnectError] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  useSyncExternalStore(
    subscribeConnectorConnections,
    getConnectorConnectionsSnapshot,
    getConnectorConnectionsServerSnapshot,
  );
  const { data: attachments } = useSpaceAttachments();
  const { data: buildProjects } = useSpaceProjects("build");
  const { data: automations } = useSpaceProjects("build", {
    kind: "automation",
  });
  const blockedIds = blockedConnectorIds(
    workspaceId,
    workspacePolicies,
    billingPlan,
  );
  const allowed = connectors.filter((item) => !blockedIds.includes(item.id));
  const blocked = connectors.filter((item) => blockedIds.includes(item.id));
  const selected =
    allowed.find((item) => item.id === connectorId) ??
    allowed[0] ??
    connectors[0];
  const execute = panelIntent === "execute" || Boolean(connectorId);
  const liveConnections = connectionsForConnectorLive(workspaceId, selected.id);
  const accounts = activeAccountsForConnector(workspaceId, selected.id);
  const pendingConnection = liveConnections.find((row) => row.status === "pending");
  const activeConnection = liveConnections.find((row) => row.status === "active");
  const hasActiveConnection = Boolean(activeConnection);
  const disconnectableConnections = liveConnections.filter(
    (row) => row.status === "pending" || row.status === "active",
  );

  const relatedApps = useMemo(() => {
    const fromAttach = attachments
      .map((item) =>
        buildProjects.find((project) => project.id === item.targetId),
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const published = buildProjects.filter(
      (item) =>
        item.kind !== "automation" &&
        item.status === "published" &&
        !fromAttach.some((attached) => attached.id === item.id),
    );
    return [...fromAttach, ...published].slice(0, 6);
  }, [attachments, buildProjects]);

  const relatedAutomations = useMemo(
    () => automations.filter((item) => item.status === "published").slice(0, 6),
    [automations],
  );

  if (!execute) {
    return <ProjectsBrowser />;
  }

  return (
    <div className={SHELL_PANEL_BODY}>
      <PanelChrome kicker="Connector" title={selected.name} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full">
          <div className="w-[42%] min-w-[10rem] border-r border-border py-3">
            <SectionLabel>Apps</SectionLabel>
            {allowed.map((item) => {
              const count = connectionsForConnectorLive(
                workspaceId,
                item.id,
              ).filter((row) => row.status === "active").length;
              return (
                <Row
                  key={item.id}
                  title={item.name}
                  meta={`${count}`}
                  active={selected.id === item.id}
                  onClick={() => openConnector(item.id)}
                  leading={<ConnectorMark id={item.icon} size="xs" />}
                />
              );
            })}
            {blocked.length ? (
              <>
                <SectionLabel>Disabled here</SectionLabel>
                {blocked.map((item) => (
                  <Row
                    key={item.id}
                    title={item.name}
                    meta="Blocked"
                    leading={<ConnectorMark id={item.icon} size="xs" />}
                  />
                ))}
              </>
            ) : null}
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto py-3">
            <SectionLabel>{selected.name}</SectionLabel>
            <p className="px-3 pb-2 text-[12.5px] leading-relaxed text-muted-foreground">
              {selected.description}
            </p>
            {accounts.length ? (
              accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-2.5 px-3 py-2"
                >
                  <ConnectorMark id={selected.icon} size="xs" />
                  <div className="min-w-0">
                    <p className="text-[13px]">{account.label}</p>
                    <p
                      className={cn(
                        "font-mono text-[11px]",
                        account.status === "connected"
                          ? "text-muted-foreground"
                          : "text-chart-3",
                      )}
                    >
                      {account.status === "needs-reauth"
                        ? "Needs reauthentication"
                        : account.status}
                    </p>
                  </div>
                </div>
              ))
            ) : pendingConnection ? (
              <div className="flex items-center gap-2.5 px-3 py-2">
                <ConnectorMark id={selected.icon} size="xs" />
                <div className="min-w-0">
                  <p className="text-[13px]">{selected.name}</p>
                  <p className="font-mono text-[11px] text-chart-3">
                    Connecting — finish authorization to activate
                  </p>
                </div>
              </div>
            ) : (
              <p className="px-3 py-2 text-[13px] text-muted-foreground">
                No account connected yet.
              </p>
            )}
            {activeConnection ? (
              <ConnectorToolPermissions
                workspaceId={workspaceId}
                connection={activeConnection}
                className="mt-3"
                onUpdated={() => {
                  void fetchConnectorConnections(workspaceId).then((connections) => {
                    replaceConnectorConnectionsForWorkspace(workspaceId, connections);
                  });
                }}
              />
            ) : null}
            <div className="mt-3">
              <SectionLabel>Actions</SectionLabel>
              {selected.actions.map((action) => (
                <Row key={action} title={action} />
              ))}
            </div>
            <div className="mt-3">
              <SectionLabel>Apps using this</SectionLabel>
              {relatedApps.length ? (
                relatedApps.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openProject(item.id)}
                    className="block w-full text-left"
                  >
                    <Row title={item.title} meta="Build · in Work" />
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-[13px] text-muted-foreground">
                  No Work apps linked yet.
                </p>
              )}
            </div>
            <div className="mt-3">
              <SectionLabel>Automations using this</SectionLabel>
              {relatedAutomations.length ? (
                relatedAutomations.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openProject(item.id)}
                    className="block w-full text-left"
                  >
                    <Row title={item.title} meta="Active" />
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-[13px] text-muted-foreground">
                  No automations linked yet.
                </p>
              )}
            </div>
            <div className="mt-3 px-3 pb-3">
              {connectError ? (
                <p className="mb-2 text-[12px] text-destructive">{connectError}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={
                    selected.id !== "gmail" || hasActiveConnection || disconnecting
                  }
                  onClick={async () => {
                    setConnectError("");
                    try {
                      const { authorizationUrl } = await initiateConnectorConnection({
                        workspaceId,
                        connectorId: selected.id,
                      });
                      const connections = await fetchConnectorConnections(workspaceId);
                      replaceConnectorConnectionsForWorkspace(workspaceId, connections);
                      if (authorizationUrl) {
                        window.location.assign(authorizationUrl);
                      }
                    } catch (err) {
                      setConnectError(
                        err instanceof Error
                          ? err.message
                          : "Could not start connection.",
                      );
                    }
                  }}
                  className="inline-flex h-10 items-center rounded-full border border-foreground/20 px-4 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {hasActiveConnection
                    ? "Connected"
                    : pendingConnection
                      ? "Continue connecting"
                      : "Add connection"}
                </button>
                {disconnectableConnections.length > 0 ? (
                  <button
                    type="button"
                    disabled={disconnecting}
                    onClick={async () => {
                      const label = selected.name;
                      const ok = window.confirm(
                        `Are you sure you want to disconnect ${label}?`,
                      );
                      if (!ok) return;
                      setConnectError("");
                      setDisconnecting(true);
                      try {
                        for (const connection of disconnectableConnections) {
                          await disconnectConnectorConnection({
                            workspaceId,
                            connectionId: connection.id,
                          });
                        }
                        const connections = await fetchConnectorConnections(workspaceId);
                        replaceConnectorConnectionsForWorkspace(workspaceId, connections);
                        detachWorkConnector(workspaceId, selected.id);
                      } catch (err) {
                        setConnectError(
                          err instanceof Error
                            ? err.message
                            : "Could not disconnect.",
                        );
                      } finally {
                        setDisconnecting(false);
                      }
                    }}
                    className="inline-flex h-10 items-center rounded-full border border-destructive/30 px-4 text-[13px] font-medium tracking-[-0.01em] text-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {disconnecting ? "Disconnecting…" : "Disconnect"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
