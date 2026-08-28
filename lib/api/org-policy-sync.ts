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
  skipRemoteSync = true;
  const workspaceIds = await listMemberWorkspaceIds(ctx.actorId);
  const bundle = await fetchPolicyBundle(workspaceIds);

  if (bundle.orgMemberRows.length) {
    replacePolicyStoreState({
      policies: rebuildPoliciesFromRows(bundle),
      orgMembers: bundle.orgMemberRows.map(memberRowToMember),
    });
  } else if (bundle.policyRows.length || bundle.knowledgeBaseRows.length) {
    replacePolicyStoreState({
      policies: rebuildPoliciesFromRows(bundle),
      orgMembers: getMembersSnapshot(),
    });
  }

  window.setTimeout(() => {
    skipRemoteSync = false;
  }, 0);
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

  const kbIds = policy.knowledgeBases.map((item) => item.id);
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

  for (const kb of policy.knowledgeBases) {
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
  const supabase = createSupabaseBrowserClient();
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

export async function syncUserPrefsToSupabase(ctx: WorkspaceCtx) {
  const supabase = createSupabaseBrowserClient();
  const pins = getPinsSnapshot();
  const sidebar = getSidebarSnapshot();

  const { error: deletePinsError } = await supabase
    .from("user_pins")
    .delete()
    .eq("profile_id", ctx.actorId);
  if (deletePinsError) throw deletePinsError;

  if (pins.length) {
    const pinRows = pins.map((pin, index) => pinToRow(pin, ctx.actorId, index));
    const { error: pinError } = await supabase.from("user_pins").insert(pinRows);
    if (pinError) throw pinError;
  }

  const sidebarRow = sidebarToRow(sidebar, ctx.actorId, SIDEBAR_STORAGE_VERSION);
  const { error: sidebarError } = await supabase
    .from("sidebar_layouts")
    .upsert(sidebarRow, { onConflict: "profile_id" });
  if (sidebarError) throw sidebarError;
}

export async function hydrateUserPrefsFromRemote(ctx: WorkspaceCtx) {
  skipRemoteSync = true;
  const supabase = createSupabaseBrowserClient();

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

  if (pinResult.data?.length) {
    replacePinsState((pinResult.data as UserPinRow[]).map(pinRowToPin));
  } else {
    // No remote pins — start empty (do not keep legacy Gmail default).
    replacePinsState([]);
  }

  if (sidebarResult.data) {
    replaceSidebarState(sidebarRowToLayout(sidebarResult.data as SidebarLayoutRow));
  }

  window.setTimeout(() => {
    skipRemoteSync = false;
  }, 0);
}

/** One-time import of localStorage policy + prefs → Supabase. */
export async function importLocalOrgPolicyIfNeeded(ctx: WorkspaceCtx) {
  if (typeof window === "undefined") return;

  const policyImported =
    window.localStorage.getItem(POLICY_IMPORT_FLAG) === "1";
  const prefsImported = window.localStorage.getItem(PREFS_IMPORT_FLAG) === "1";

  if (!policyImported) {
    await syncWorkspacesCatalog(ctx);
    await syncOrgPolicyToSupabase(ctx);
    window.localStorage.setItem(POLICY_IMPORT_FLAG, "1");
  }

  if (!prefsImported) {
    await syncUserPrefsToSupabase(ctx);
    window.localStorage.setItem(PREFS_IMPORT_FLAG, "1");
  }
}

/** Debounced push after workspace-policy mutations. */
export function startOrgPolicyRemoteSync(ctx: WorkspaceCtx) {
  let lastRevision = getPolicyStoreRevision();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;

  const push = () => {
    if (syncing || skipRemoteSync) return;
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
    if (skipRemoteSync) return;
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

/** Debounced push for pins + sidebar. */
export function startUserPrefsRemoteSync(ctx: WorkspaceCtx) {
  let pinsTimer: ReturnType<typeof setTimeout> | null = null;
  let sidebarTimer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;

  const push = () => {
    if (syncing || skipRemoteSync) return;
    syncing = true;
    void syncUserPrefsToSupabase(ctx)
      .catch((err) => {
        console.warn("[cander] user prefs sync failed", err);
      })
      .finally(() => {
        syncing = false;
      });
  };

  const schedule = (which: "pins" | "sidebar") => {
    if (skipRemoteSync) return;
    if (which === "pins") {
      if (pinsTimer) clearTimeout(pinsTimer);
      pinsTimer = setTimeout(push, SYNC_DEBOUNCE_MS);
    } else {
      if (sidebarTimer) clearTimeout(sidebarTimer);
      sidebarTimer = setTimeout(push, SYNC_DEBOUNCE_MS);
    }
  };

  const unsubPins = subscribePins(() => schedule("pins"));
  const unsubSidebar = subscribeSidebar(() => schedule("sidebar"));

  return () => {
    if (pinsTimer) clearTimeout(pinsTimer);
    if (sidebarTimer) clearTimeout(sidebarTimer);
    unsubPins();
    unsubSidebar();
  };
}

export function subscribeOrgPolicyRealtime(
  ctx: WorkspaceCtx,
  onChange: () => void,
) {
  const supabase = createSupabaseBrowserClient();
  const channel = supabase
    .channel(`org-policy:${ctx.actorId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "org_members" },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "workspace_policies" },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_pins" },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function startOrgPolicyRealtimePull(ctx: WorkspaceCtx) {
  let pulling = false;

  const pull = () => {
    if (pulling) return;
    pulling = true;
    void Promise.all([
      hydrateOrgPolicyFromRemote(ctx),
      hydrateUserPrefsFromRemote(ctx),
    ])
      .catch((err) => {
        console.warn("[cander] org policy hydrate failed", err);
      })
      .finally(() => {
        pulling = false;
      });
  };

  return subscribeOrgPolicyRealtime(ctx, pull);
}

export async function bootstrapSupabaseOrgPolicy(ctx: WorkspaceCtx) {
  await importLocalOrgPolicyIfNeeded(ctx);
  await hydrateOrgPolicyFromRemote(ctx);
  await hydrateUserPrefsFromRemote(ctx);
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
