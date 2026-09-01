"use client";

import {
  accountToRow,
  installationId,
  rebuildProfileInstallsFromInstallations,
  rebuildWorkConnectorsFromInstallations,
  type ConnectorInstallationRow,
} from "@/lib/supabase/connector-mapper";
import {
  clearConnectorConnectionsCache,
  getConnectorConnectionsRevision,
  purgeLegacyConnectionStorage,
  replaceConnectorConnectionsForWorkspace,
  subscribeConnectorConnections,
} from "@/lib/connector-connections-store";
import { fetchConnectorConnections } from "@/lib/api/connector-client";
import {
  getInstalledConnectorsSnapshot,
  replaceInstalledConnectorsState,
  subscribeInstalledConnectors,
  getInstalledConnectorsRevision,
} from "@/lib/connector-install";
import {
  getWorkConnectorsSnapshot,
  replaceWorkConnectorsState,
  subscribeWorkConnectors,
  getWorkConnectorsRevision,
} from "@/lib/work-connectors";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { WorkspaceCtx } from "@/lib/space-entities";

const IMPORT_FLAG = "courier-connectors-imported-v1";
const SYNC_DEBOUNCE_MS = 600;

let skipRemoteSync = false;

async function listMemberWorkspaceIds(profileId: string) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []).map((row) => String(row.workspace_id));
}

/** Pull installation stack from Supabase; connections from server API only. */
export async function hydrateConnectorsFromRemote(ctx: WorkspaceCtx) {
  skipRemoteSync = true;
  purgeLegacyConnectionStorage();
  clearConnectorConnectionsCache();

  const supabase = createSupabaseBrowserClient();
  const workspaceIds = await listMemberWorkspaceIds(ctx.actorId);

  const [profileInstallResult, workInstallResult] = await Promise.all([
    supabase
      .from("connector_installations")
      .select("*")
      .eq("profile_id", ctx.actorId)
      .is("workspace_id", null),
    workspaceIds.length
      ? supabase
          .from("connector_installations")
          .select("*")
          .eq("profile_id", ctx.actorId)
          .not("workspace_id", "is", null)
          .in("workspace_id", workspaceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profileInstallResult.error) throw profileInstallResult.error;
  if (workInstallResult.error) throw workInstallResult.error;

  const installRows = [
    ...((profileInstallResult.data ?? []) as ConnectorInstallationRow[]),
    ...((workInstallResult.data ?? []) as ConnectorInstallationRow[]),
  ];

  if (installRows.length) {
    replaceInstalledConnectorsState(
      rebuildProfileInstallsFromInstallations(installRows),
    );
    replaceWorkConnectorsState(
      rebuildWorkConnectorsFromInstallations(installRows),
    );
  }

  for (const workspaceId of workspaceIds) {
    try {
      const connections = await fetchConnectorConnections(workspaceId);
      replaceConnectorConnectionsForWorkspace(workspaceId, connections);
    } catch (err) {
      console.warn("[cander] connection hydrate failed", workspaceId, err);
    }
  }

  window.setTimeout(() => {
    skipRemoteSync = false;
  }, 0);
}

/** Installations only — never sync connection accounts from browser. */
export async function syncConnectorsToSupabase(ctx: WorkspaceCtx) {
  const supabase = createSupabaseBrowserClient();
  const workspaceIds = await listMemberWorkspaceIds(ctx.actorId);
  const profileInstalls = getInstalledConnectorsSnapshot();
  const workByWorkspace = getWorkConnectorsSnapshot();

  const { error: deleteProfileError } = await supabase
    .from("connector_installations")
    .delete()
    .eq("profile_id", ctx.actorId)
    .is("workspace_id", null);
  if (deleteProfileError) throw deleteProfileError;

  if (profileInstalls.length) {
    const rows: ConnectorInstallationRow[] = profileInstalls.map(
      (connectorId, index) => ({
        id: installationId(ctx.actorId, connectorId),
        profile_id: ctx.actorId,
        workspace_id: null,
        connector_id: connectorId,
        sort_order: index,
      }),
    );
    const { error } = await supabase.from("connector_installations").insert(rows);
    if (error) throw error;
  }

  for (const workspaceId of workspaceIds) {
    const stack = workByWorkspace[workspaceId];
    const { error: deleteWorkError } = await supabase
      .from("connector_installations")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("profile_id", ctx.actorId);
    if (deleteWorkError) throw deleteWorkError;

    if (!stack?.length) continue;

    const rows: ConnectorInstallationRow[] = stack.map((connectorId, index) => ({
      id: installationId(ctx.actorId, connectorId, workspaceId),
      profile_id: ctx.actorId,
      workspace_id: workspaceId,
      connector_id: connectorId,
      sort_order: index,
    }));
    const { error } = await supabase.from("connector_installations").insert(rows);
    if (error) throw error;
  }
}

export async function importLocalConnectorsIfNeeded(_ctx: WorkspaceCtx) {
  if (typeof window === "undefined") return;
  purgeLegacyConnectionStorage();
  window.localStorage.setItem(IMPORT_FLAG, "1");
}

function maxRevision() {
  return Math.max(
    getWorkConnectorsRevision(),
    getInstalledConnectorsRevision(),
    getConnectorConnectionsRevision(),
  );
}

export function startConnectorRemoteSync(ctx: WorkspaceCtx) {
  let lastRevision = maxRevision();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;

  const push = () => {
    if (syncing || skipRemoteSync) return;
    syncing = true;
    void syncConnectorsToSupabase(ctx)
      .catch((err) => {
        console.warn("[cander] connector installation sync failed", err);
      })
      .finally(() => {
        syncing = false;
      });
  };

  const schedule = () => {
    if (skipRemoteSync) return;
    const revision = maxRevision();
    if (revision === lastRevision) return;
    lastRevision = revision;
    if (timer) clearTimeout(timer);
    timer = setTimeout(push, SYNC_DEBOUNCE_MS);
  };

  const unsubWork = subscribeWorkConnectors(schedule);
  const unsubInstall = subscribeInstalledConnectors(schedule);

  return () => {
    if (timer) clearTimeout(timer);
    unsubWork();
    unsubInstall();
  };
}

export function subscribeConnectorRealtime(
  ctx: WorkspaceCtx,
  onChange: () => void,
) {
  const supabase = createSupabaseBrowserClient();
  const channel = supabase
    .channel(`connectors:${ctx.actorId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "connector_installations",
        filter: `profile_id=eq.${ctx.actorId}`,
      },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "connector_connections",
        filter: `owner_id=eq.${ctx.actorId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function startConnectorRealtimePull(ctx: WorkspaceCtx) {
  let pulling = false;

  const pull = () => {
    if (pulling) return;
    pulling = true;
    void hydrateConnectorsFromRemote(ctx)
      .catch((err) => {
        console.warn("[cander] connector hydrate failed", err);
      })
      .finally(() => {
        pulling = false;
      });
  };

  return subscribeConnectorRealtime(ctx, pull);
}

export async function bootstrapSupabaseConnectors(ctx: WorkspaceCtx) {
  await importLocalConnectorsIfNeeded(ctx);
  await hydrateConnectorsFromRemote(ctx);
}

export function startSupabaseConnectorSync(ctx: WorkspaceCtx) {
  const stopRemote = startConnectorRemoteSync(ctx);
  const stopRealtime = startConnectorRealtimePull(ctx);
  return () => {
    stopRemote();
    stopRealtime();
  };
}

export function subscribeAllConnectorStores(listener: () => void) {
  const unsubWork = subscribeWorkConnectors(listener);
  const unsubInstall = subscribeInstalledConnectors(listener);
  const unsubConnections = subscribeConnectorConnections(listener);
  return () => {
    unsubWork();
    unsubInstall();
    unsubConnections();
  };
}

// Unused export kept for mapper compatibility in tests
export { accountToRow };
