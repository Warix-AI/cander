"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  knowledgeBaseToRow,
  knowledgeFileToRow,
  memberRowToMember,
  pinRowToPin,
  pinToRow,
  rebuildPoliciesFromRows,
  sidebarRowToLayout,
  sidebarToRow,
  type KnowledgeBaseRow,
  type KnowledgeFileRow,
  type OrgMemberRow,
  type SidebarLayoutRow,
  type UserPinRow,
  type WorkspaceMemberSpaceRow,
  type WorkspacePolicyRow,
} from "@/lib/supabase/org-policy-mapper";
import { applyOrgMembershipClientState } from "@/lib/org-membership-state";
import {
  getMembersSnapshot,
  getPoliciesSnapshot,
  getPolicyStoreRevision,
  replacePolicyStoreState,
  subscribePolicyStore,
} from "@/lib/workspace-policy";
import {
  getPinsSnapshot,
  getSidebarSnapshot,
  arePinsDirty,
  getPinsLocalEpoch,
  getPinsProfileId,
  getPinsScopeVersion,
  markPinsSynced,
  replacePinsState,
  replaceSidebarState,
  SIDEBAR_STORAGE_VERSION,
  subscribePins,
  subscribeSidebar,
} from "@/lib/session";
import { getWorkspaceCatalogSnapshot } from "@/lib/workspace-catalog";
import type { WorkspaceCtx } from "@/lib/space-entities";
import type { WorkspacePolicy } from "@/lib/types";

const POLICY_IMPORT_FLAG = "courier-org-policy-imported-v1";
const PREFS_IMPORT_FLAG = "courier-user-prefs-imported-v1";
const SYNC_DEBOUNCE_MS = 600;
/** Pins must land remotely before hydrate can resurrect them. */
const PINS_SYNC_DEBOUNCE_MS = 0;

let remoteSyncBlocks = 0;

function isRemoteSyncPaused() {
  return remoteSyncBlocks > 0;
}

/** Nested/overlapping requests cannot release each other's sync guard. */
function pauseRemoteSync() {
  remoteSyncBlocks += 1;
  return () => {
    remoteSyncBlocks -= 1;
  };
}

function isCurrentPinsScope(ctx: WorkspaceCtx, version: number) {
  return getPinsProfileId() === ctx.actorId && getPinsScopeVersion() === version;
}

async function listMemberWorkspaceIds(profileId: string) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []).map((row) => String(row.workspace_id));
}

async function fetchPolicyBundle(workspaceIds: string[]) {
  if (!workspaceIds.length) {
    return {
      policyRows: [] as WorkspacePolicyRow[],
      memberSpaceRows: [] as WorkspaceMemberSpaceRow[],
      knowledgeBaseRows: [] as KnowledgeBaseRow[],
      knowledgeFileRows: [] as KnowledgeFileRow[],
      orgMemberRows: [] as OrgMemberRow[],
    };
  }

  const supabase = createSupabaseBrowserClient();
  const [
    policyResult,
    memberSpaceResult,
    kbResult,
    fileResult,
    orgMemberResult,
  ] = await Promise.all([
    supabase.from("workspace_policies").select("*").in("workspace_id", workspaceIds),
    supabase
      .from("workspace_member_spaces")
      .select("*")
      .in("workspace_id", workspaceIds),
    supabase.from("knowledge_bases").select("*").in("workspace_id", workspaceIds),
    supabase.from("knowledge_files").select("*").in("workspace_id", workspaceIds),
    supabase.from("org_members").select("*"),
  ]);

  if (policyResult.error) throw policyResult.error;
  if (memberSpaceResult.error) throw memberSpaceResult.error;
  if (kbResult.error) throw kbResult.error;
  if (fileResult.error) throw fileResult.error;
  if (orgMemberResult.error) throw orgMemberResult.error;

  return {
    policyRows: (policyResult.data ?? []) as WorkspacePolicyRow[],
    memberSpaceRows: (memberSpaceResult.data ?? []) as WorkspaceMemberSpaceRow[],
    knowledgeBaseRows: (kbResult.data ?? []) as KnowledgeBaseRow[],
    knowledgeFileRows: (fileResult.data ?? []) as KnowledgeFileRow[],
    orgMemberRows: (orgMemberResult.data ?? []) as OrgMemberRow[],
  };
}

/** Pull remote org policy into local stores. */
export async function hydrateOrgPolicyFromRemote(ctx: WorkspaceCtx) {
  const release = pauseRemoteSync();
  const scopeVersion = getPinsScopeVersion();
  try {
    const workspaceIds = await listMemberWorkspaceIds(ctx.actorId);
    const bundle = await fetchPolicyBundle(workspaceIds);
    if (!isCurrentPinsScope(ctx, scopeVersion)) return;

    if (bundle.orgMemberRows.length) {
      const orgMembers = bundle.orgMemberRows.map((row) => {
        const parsed = memberRowToMember(row);
        if (parsed.id !== ctx.actorId) return parsed;
        return applyOrgMembershipClientState(parsed);
      });
      replacePolicyStoreState({
        policies: rebuildPoliciesFromRows(bundle),
        orgMembers,
      });
    } else if (bundle.policyRows.length || bundle.knowledgeBaseRows.length) {
      replacePolicyStoreState({
        policies: rebuildPoliciesFromRows(bundle),
        orgMembers: getMembersSnapshot().map((member) =>
          member.id === ctx.actorId
            ? applyOrgMembershipClientState(member)
            : member,
        ),
      });
    }
  } finally {
    release();
  }
}

async function syncWorkspacePolicy(
  workspaceId: string,
  policy: WorkspacePolicy,
) {
  const supabase = createSupabaseBrowserClient();
  const header: WorkspacePolicyRow = {
    workspace_id: workspaceId,
    disabled_connectors: policy.disabledConnectors,
    version: 1,
  };

  const { error: headerError } = await supabase
    .from("workspace_policies")
    .upsert(header, { onConflict: "workspace_id" });
  if (headerError) throw headerError;

  const { error: deleteSpacesError } = await supabase
    .from("workspace_member_spaces")
    .delete()
    .eq("workspace_id", workspaceId);
  if (deleteSpacesError) throw deleteSpacesError;

  if (policy.members.length) {
    const memberRows: WorkspaceMemberSpaceRow[] = policy.members.map((row) => ({
      workspace_id: workspaceId,
      member_id: row.memberId,
      spaces: row.spaces,
    }));
    const { error: spaceError } = await supabase
      .from("workspace_member_spaces")
      .insert(memberRows);
    if (spaceError) throw spaceError;
  }

  const knowledgeBases = policy.knowledgeBases.slice(0, 1);
  const kbIds = knowledgeBases.map((item) => item.id);
  if (kbIds.length) {
    const { error: deleteFilesError } = await supabase
      .from("knowledge_files")
      .delete()
      .in("knowledge_base_id", kbIds);
    if (deleteFilesError) throw deleteFilesError;
  }

  const { error: deleteKbError } = await supabase
    .from("knowledge_bases")
    .delete()
    .eq("workspace_id", workspaceId);
  if (deleteKbError) throw deleteKbError;

  for (const kb of knowledgeBases) {
    const kbRow = knowledgeBaseToRow(kb, workspaceId);
    const { error: kbError } = await supabase.from("knowledge_bases").insert(kbRow);
    if (kbError) throw kbError;

    if (kb.files.length) {
      const fileRows = kb.files.map((file) =>
        knowledgeFileToRow(file, kb.id, workspaceId),
      );
      const { error: fileError } = await supabase
        .from("knowledge_files")
        .insert(fileRows);
      if (fileError) throw fileError;
    }
  }
}

export async function syncOrgPolicyToSupabase(ctx: WorkspaceCtx) {
  const members = getMembersSnapshot();
  const policies = getPoliciesSnapshot();
  const workspaceIds = await listMemberWorkspaceIds(ctx.actorId);

  if (members.length) {
    // Roster mutations go through service-role APIs; client upserts were an
    // escalation vector once org_members writes were locked down.
    console.info(
      "[cander] skipping client org_members upsert (%d local members)",
      members.length,
    );
  }

  for (const workspaceId of workspaceIds) {
    const policy = policies[workspaceId];
    if (!policy) continue;
    await syncWorkspacePolicy(workspaceId, policy);
  }
}

async function syncWorkspacesCatalog(ctx: WorkspaceCtx) {
  const supabase = createSupabaseBrowserClient();
  // Only sync workspaces the actor already belongs to — never push catalog seeds.
  const memberWorkspaceIds = await listMemberWorkspaceIds(ctx.actorId);
  if (!memberWorkspaceIds.length) return;

  const catalog = getWorkspaceCatalogSnapshot();
  const byId = new Map(catalog.map((item) => [item.id, item]));

  for (const workspaceId of memberWorkspaceIds) {
    const item = byId.get(workspaceId);
    if (!item) continue;
    const row = {
      id: item.id,
      name: item.name,
      kind: item.kind ?? (item.personal ? "personal" : "business"),
      personal: item.personal ?? item.kind === "personal",
      spaces: item.spaces,
      budget: item.budget,
      spend: item.spend,
    };

    const { error: insertError } = await supabase.from("workspaces").insert(row);
    if (insertError && insertError.code !== "23505") throw insertError;
  }
}

// Serialize bootstrap, realtime recovery, and live edits so an older prune
// cannot run after a newer pin save.
let prefsWriteQueue: Promise<void> = Promise.resolve();

export function syncUserPrefsToSupabase(ctx: WorkspaceCtx): Promise<void> {
  const scopeVersion = getPinsScopeVersion();
  const run = prefsWriteQueue.then(async () => {
    if (!isCurrentPinsScope(ctx, scopeVersion)) return;
    await pushUserPrefs(ctx, scopeVersion);
  });
  prefsWriteQueue = run.catch(() => {});
  return run;
}

async function pushUserPrefs(ctx: WorkspaceCtx, scopeVersion: number) {
  const supabase = createSupabaseBrowserClient();
  const pins = getPinsSnapshot();
  const epochAtStart = getPinsLocalEpoch();
  const pinsDirty = arePinsDirty();
  const sidebar = getSidebarSnapshot();
  const release = pauseRemoteSync();
  try {
    // Sidebar changes and empty startup caches must never overwrite pins.
    // Only an explicit local pin/unpin/reorder authorizes a remote write.
    if (pinsDirty) {
      if (pins.length) {
        const pinRows = pins.map((pin, index) => pinToRow(pin, ctx.actorId, index));
        const { error: pinError } = await supabase
          .from("user_pins")
          .upsert(pinRows, { onConflict: "profile_id,kind,target_id" });
        if (pinError) throw pinError;
        if (!isCurrentPinsScope(ctx, scopeVersion)) return;

        // This also removes legacy row IDs after they have been upgraded by
        // the unique (profile_id, kind, target_id) upsert above.
        const keepIds = pinRows.map((row) => row.id);
        let pruneQuery = supabase
          .from("user_pins")
          .delete()
          .eq("profile_id", ctx.actorId);
        if (keepIds.length === 1) {
          pruneQuery = pruneQuery.neq("id", keepIds[0]!);
        } else {
          pruneQuery = pruneQuery.not(
            "id",
            "in",
            `(${keepIds.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`,
          );
        }
        const { error: pruneError } = await pruneQuery;
        if (pruneError) throw pruneError;
      } else {
        const { error: deletePinsError } = await supabase
          .from("user_pins")
          .delete()
          .eq("profile_id", ctx.actorId);
        if (deletePinsError) throw deletePinsError;
      }
      if (!isCurrentPinsScope(ctx, scopeVersion)) return;
      markPinsSynced(epochAtStart);
    }

    if (!isCurrentPinsScope(ctx, scopeVersion)) return;
    const sidebarRow = sidebarToRow(sidebar, ctx.actorId, SIDEBAR_STORAGE_VERSION);
    const { error: sidebarError } = await supabase
      .from("sidebar_layouts")
      .upsert(sidebarRow, { onConflict: "profile_id" });
    if (sidebarError) throw sidebarError;
  } finally {
    release();
  }
}

export async function hydrateUserPrefsFromRemote(ctx: WorkspaceCtx) {
  const scopeVersion = getPinsScopeVersion();
  if (!isCurrentPinsScope(ctx, scopeVersion)) return;
  getPinsSnapshot();
  const epochAtStart = getPinsLocalEpoch();
  const dirtyAtStart = arePinsDirty();
  const release = pauseRemoteSync();
  const supabase = createSupabaseBrowserClient();
  let pushLocalPrefs = false;
  try {
    const [pinResult, sidebarResult] = await Promise.all([
      supabase
        .from("user_pins")
        .select("*")
        .eq("profile_id", ctx.actorId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("sidebar_layouts")
        .select("*")
        .eq("profile_id", ctx.actorId)
        .maybeSingle(),
    ]);

    if (pinResult.error) throw pinResult.error;
    if (sidebarResult.error) throw sidebarResult.error;
    if (!isCurrentPinsScope(ctx, scopeVersion)) return;

    // A read that started before a local edit/save is stale, even if that save
    // has already cleared the dirty flag by the time the read finishes.
    if (arePinsDirty()) {
      pushLocalPrefs = true;
    } else if (!dirtyAtStart && getPinsLocalEpoch() === epochAtStart) {
      replacePinsState(((pinResult.data ?? []) as UserPinRow[]).map(pinRowToPin));
    }

    if (sidebarResult.data) {
      replaceSidebarState(sidebarRowToLayout(sidebarResult.data as SidebarLayoutRow));
    } else {
      // Preserve the first-time sidebar import before legacy cleanup removes
      // its local payload. The save still writes pins only when they are dirty.
      pushLocalPrefs = true;
    }
  } finally {
    release();
  }

  if (pushLocalPrefs && isCurrentPinsScope(ctx, scopeVersion)) {
    await syncUserPrefsToSupabase(ctx);
  }
}

/** One-time import of localStorage policy → Supabase. Prefs hydrate first. */
export async function importLocalOrgPolicyIfNeeded(ctx: WorkspaceCtx) {
  if (typeof window === "undefined") return;

  const policyImported =
    window.localStorage.getItem(POLICY_IMPORT_FLAG) === "1";

  if (!policyImported) {
    await syncWorkspacesCatalog(ctx);
    await syncOrgPolicyToSupabase(ctx);
    window.localStorage.setItem(POLICY_IMPORT_FLAG, "1");
  }
}

/** Debounced push after workspace-policy mutations. */
export function startOrgPolicyRemoteSync(ctx: WorkspaceCtx) {
  let lastRevision = getPolicyStoreRevision();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;

  const push = () => {
    if (syncing || isRemoteSyncPaused()) return;
    syncing = true;
    void syncOrgPolicyToSupabase(ctx)
      .catch((err) => {
        console.warn("[cander] org policy sync failed", err);
      })
      .finally(() => {
        syncing = false;
      });
  };

  const unsub = subscribePolicyStore(() => {
    if (isRemoteSyncPaused()) return;
    const revision = getPolicyStoreRevision();
    if (revision === lastRevision) return;
    lastRevision = revision;
    if (timer) clearTimeout(timer);
    timer = setTimeout(push, SYNC_DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}

/** Debounced push for pins + sidebar. Pins flush immediately so unpin sticks. */
export function startUserPrefsRemoteSync(ctx: WorkspaceCtx) {
  const scopeVersion = getPinsScopeVersion();
  let pinsTimer: ReturnType<typeof setTimeout> | null = null;
  let sidebarTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let syncing = false;
  let pinsQueued = false;
  let sidebarQueued = false;

  const push = () => {
    if (disposed || !isCurrentPinsScope(ctx, scopeVersion)) return;
    if (syncing || isRemoteSyncPaused()) {
      // Retry shortly if we blocked ourselves mid-window.
      if (pinsQueued || sidebarQueued) {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(push, 200);
      }
      return;
    }
    syncing = true;
    pinsQueued = false;
    sidebarQueued = false;
    void syncUserPrefsToSupabase(ctx)
      .catch((err) => {
        console.warn("[cander] user prefs sync failed", err);
      })
      .finally(() => {
        syncing = false;
        if (pinsQueued || sidebarQueued) push();
      });
  };

  const schedule = (which: "pins" | "sidebar") => {
    if (disposed || !isCurrentPinsScope(ctx, scopeVersion)) return;
    if (which === "pins" && !arePinsDirty()) return;
    if (isRemoteSyncPaused() && which !== "pins") return;
    if (which === "pins") {
      pinsQueued = true;
      if (pinsTimer) clearTimeout(pinsTimer);
      pinsTimer = setTimeout(push, PINS_SYNC_DEBOUNCE_MS);
    } else {
      if (isRemoteSyncPaused()) return;
      sidebarQueued = true;
      if (sidebarTimer) clearTimeout(sidebarTimer);
      sidebarTimer = setTimeout(push, SYNC_DEBOUNCE_MS);
    }
  };

  const unsubPins = subscribePins(() => schedule("pins"));
  const unsubSidebar = subscribeSidebar(() => schedule("sidebar"));
  // Edits may have been queued before a workspace navigation stopped the
  // previous listener, or while the browser was offline.
  if (arePinsDirty()) schedule("pins");

  return () => {
    disposed = true;
    if (pinsTimer) clearTimeout(pinsTimer);
    if (sidebarTimer) clearTimeout(sidebarTimer);
    if (retryTimer) clearTimeout(retryTimer);
    unsubPins();
    unsubSidebar();
  };
}

export function subscribeOrgPolicyRealtime(
  ctx: WorkspaceCtx,
  handlers: {
    onOrgChange: () => void;
    onPinsChange: () => void;
  },
) {
  const supabase = createSupabaseBrowserClient();
  const channel = supabase
    .channel(`org-policy:${ctx.actorId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "org_members" },
      () => handlers.onOrgChange(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "workspace_policies" },
      () => handlers.onOrgChange(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_pins" },
      () => handlers.onPinsChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function startOrgPolicyRealtimePull(ctx: WorkspaceCtx) {
  const scopeVersion = getPinsScopeVersion();
  let disposed = false;
  let orgPulling = false;
  let prefsPulling = false;
  let orgTimer: ReturnType<typeof setTimeout> | null = null;
  let prefsTimer: ReturnType<typeof setTimeout> | null = null;

  const pullOrg = () => {
    if (disposed || !isCurrentPinsScope(ctx, scopeVersion)) return;
    if (orgPulling || isRemoteSyncPaused()) return;
    orgPulling = true;
    void hydrateOrgPolicyFromRemote(ctx)
      .catch((err) => {
        console.warn("[cander] org policy hydrate failed", err);
      })
      .finally(() => {
        orgPulling = false;
      });
  };

  const pullPrefs = () => {
    if (disposed || !isCurrentPinsScope(ctx, scopeVersion)) return;
    if (prefsPulling || isRemoteSyncPaused()) return;
    prefsPulling = true;
    void hydrateUserPrefsFromRemote(ctx)
      .catch((err) => {
        console.warn("[cander] user prefs hydrate failed", err);
      })
      .finally(() => {
        prefsPulling = false;
      });
  };

  const stop = subscribeOrgPolicyRealtime(ctx, {
    onOrgChange: () => {
      if (orgTimer) clearTimeout(orgTimer);
      orgTimer = setTimeout(pullOrg, 900);
    },
    onPinsChange: () => {
      // Ignore echoes from our own delete→insert push window.
      if (isRemoteSyncPaused()) return;
      if (prefsTimer) clearTimeout(prefsTimer);
      prefsTimer = setTimeout(pullPrefs, 1500);
    },
  });

  return () => {
    disposed = true;
    if (orgTimer) clearTimeout(orgTimer);
    if (prefsTimer) clearTimeout(prefsTimer);
    stop();
  };
}

export async function bootstrapSupabaseOrgPolicy(ctx: WorkspaceCtx) {
  // The provider binds the profile before starting bootstrap. An obsolete
  // async bootstrap must not rebind the global store to an earlier account.
  const scopeVersion = getPinsScopeVersion();
  if (!isCurrentPinsScope(ctx, scopeVersion)) return;
  await hydrateUserPrefsFromRemote(ctx);
  if (!isCurrentPinsScope(ctx, scopeVersion)) return;
  window.localStorage.setItem(PREFS_IMPORT_FLAG, "1");
  await importLocalOrgPolicyIfNeeded(ctx);
  if (!isCurrentPinsScope(ctx, scopeVersion)) return;
  await hydrateOrgPolicyFromRemote(ctx);
}

export function startSupabaseOrgPolicySync(ctx: WorkspaceCtx) {
  const stopPolicy = startOrgPolicyRemoteSync(ctx);
  const stopPrefs = startUserPrefsRemoteSync(ctx);
  const stopRealtime = startOrgPolicyRealtimePull(ctx);

  return () => {
    stopPolicy();
    stopPrefs();
    stopRealtime();
  };
}
