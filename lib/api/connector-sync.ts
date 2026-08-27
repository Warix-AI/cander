"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  accountToRow,
  installationId,
  rebuildConnectionsFromAccounts,
  rebuildProfileInstallsFromInstallations,
  rebuildWorkConnectorsFromInstallations,
  type ConnectorAccountRow,
  type ConnectorInstallationRow,
} from "@/lib/supabase/connector-mapper";
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
import {
  getWorkspaceConnectionsSnapshot,
  replaceWorkspaceConnectionsState,
  subscribeWorkspaceConnections,
  getWorkspaceConnectionsRevision,
} from "@/lib/workspace-connections";
import type { WorkspaceCtx } from "@/lib/space-entities";

const IMPORT_FLAG = "courier-connectors-imported-v1";
const SYNC_DEBOUNCE_MS = 600;

const WORK_STORAGE_KEY = "courier-work-connectors";
const INSTALL_STORAGE_KEY = "courier-installed-connectors";
const CONNECTIONS_STORAGE_KEY = "courier-workspace-connections";

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

/** Pull connector state from Supabase into local stores. */
export async function hydrateConnectorsFromRemote(ctx: WorkspaceCtx) {
  skipRemoteSync = true;
  const supabase = createSupabaseBrowserClient();
  const workspaceIds = await listMemberWorkspaceIds(ctx.actorId);

  const [profileInstallResult, workInstallResult, accountResult] =
    await Promise.all([
      supabase
        .from("connector_installations")
        .select("*")
        .eq("profile_id", ctx.actorId)
        .is("workspace_id", null),
      workspaceIds.length
        ? supabase
            .from("connector_installations")
            .select("*")
            .in("workspace_id", workspaceIds)
        : Promise.resolve({ data: [], error: null }),
      workspaceIds.length
        ? supabase
            .from("connector_accounts")
            .select("*")
            .in("workspace_id", workspaceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (profileInstallResult.error) throw profileInstallResult.error;
  if (workInstallResult.error) throw workInstallResult.error;
  if (accountResult.error) throw accountResult.error;

  const installRows = [
    ...((profileInstallResult.data ?? []) as ConnectorInstallationRow[]),
    ...((workInstallResult.data ?? []) as ConnectorInstallationRow[]),
  ];
  const accountRows = (accountResult.data ?? []) as ConnectorAccountRow[];

  if (installRows.length) {
    replaceInstalledConnectorsState(
      rebuildProfileInstallsFromInstallations(installRows),
    );
    replaceWorkConnectorsState(
      rebuildWorkConnectorsFromInstallations(installRows),
    );
  }

  if (accountRows.length) {
    replaceWorkspaceConnectionsState(
      rebuildConnectionsFromAccounts(accountRows),
    );
  }

  window.setTimeout(() => {
    skipRemoteSync = false;
  }, 0);
}

export async function syncConnectorsToSupabase(ctx: WorkspaceCtx) {
  const supabase = createSupabaseBrowserClient();
  const workspaceIds = await listMemberWorkspaceIds(ctx.actorId);
  const profileInstalls = getInstalledConnectorsSnapshot();
  const workByWorkspace = getWorkConnectorsSnapshot();
  const connections = getWorkspaceConnectionsSnapshot();

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
    if (!stack?.length) continue;

    const { error: deleteWorkError } = await supabase
      .from("connector_installations")
      .delete()
      .eq("workspace_id", workspaceId);
    if (deleteWorkError) throw deleteWorkError;

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

  for (const workspaceId of workspaceIds) {
    const map = connections[workspaceId];
    const { error: deleteAccountsError } = await supabase
      .from("connector_accounts")
      .delete()
      .eq("workspace_id", workspaceId);
    if (deleteAccountsError) throw deleteAccountsError;

    if (!map) continue;
    const rows = Object.entries(map).flatMap(([connectorId, accounts]) =>
      accounts.map((account) =>
        accountToRow(account, workspaceId, connectorId, ctx.actorId),
      ),
    );
    if (!rows.length) continue;
    const { error } = await supabase.from("connector_accounts").insert(rows);
    if (error) throw error;
  }
}

function readLocalConnectorPayload() {
  if (typeof window === "undefined") return null;
  return {
    work: window.localStorage.getItem(WORK_STORAGE_KEY),
    installed: window.localStorage.getItem(INSTALL_STORAGE_KEY),
    connections: window.localStorage.getItem(CONNECTIONS_STORAGE_KEY),
  };
}

/** One-time import of localStorage connector state → Supabase. */
export async function importLocalConnectorsIfNeeded(ctx: WorkspaceCtx) {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(IMPORT_FLAG) === "1") return;

  const raw = readLocalConnectorPayload();
  if (raw?.work || raw?.installed || raw?.connections) {
    await syncConnectorsToSupabase(ctx);
  }

  window.localStorage.setItem(IMPORT_FLAG, "1");
}

function maxRevision() {
  return Math.max(
    getWorkConnectorsRevision(),
    getInstalledConnectorsRevision(),
    getWorkspaceConnectionsRevision(),
  );
}

/** Debounced push after local connector store mutations. */
export function startConnectorRemoteSync(ctx: WorkspaceCtx) {
  let lastRevision = maxRevision();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;

  const push = () => {
    if (syncing || skipRemoteSync) return;
    syncing = true;
    void syncConnectorsToSupabase(ctx)
      .catch((err) => {
        console.warn("[cander] connector sync failed", err);
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
  const unsubConnections = subscribeWorkspaceConnections(schedule);

  return () => {
    if (timer) clearTimeout(timer);
    unsubWork();
    unsubInstall();
    unsubConnections();
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
      { event: "*", schema: "public", table: "connector_accounts" },
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
  const unsubConnections = subscribeWorkspaceConnections(listener);
  return () => {
    unsubWork();
    unsubInstall();
    unsubConnections();
  };
}
