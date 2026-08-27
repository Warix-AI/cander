"use client";

import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { memberFromSupabaseUser } from "@/lib/supabase/member-from-user";
import { NAV_SPACES } from "@/lib/spaces";
import { getWorkspaceSnapshot, persistWorkspace } from "@/lib/session";
import { normalizePlan, isTeamPlan } from "@/lib/plans";
import { upsertCatalogWorkspace } from "@/lib/workspace-catalog";
import {
  ensurePolicy,
  getPoliciesSnapshot,
  replacePolicyStoreState,
  upsertOrgMember,
} from "@/lib/workspace-policy";
import { memberRowToMember, type OrgMemberRow } from "@/lib/supabase/org-policy-mapper";
import { persistOrgId, persistOrgName } from "@/lib/org-onboarding";
import type { BillingPlan, Member, Role, SpaceId, SubscriptionStatus, WorkspaceKind } from "@/lib/types";

function asPlan(value: unknown): BillingPlan {
  return normalizePlan(value);
}

function asRole(value: unknown): Role {
  if (value === "Owner" || value === "Admin" || value === "Member") return value;
  return "Owner";
}

function asSpaces(value: unknown): SpaceId[] {
  const valid = new Set<string>(["work", "build", "research"]);
  if (!Array.isArray(value) || !value.length) return [...NAV_SPACES];
  const set = new Set<SpaceId>();
  for (const id of value.map(String)) {
    if (valid.has(id)) set.add(id as SpaceId);
  }
  for (const id of NAV_SPACES) set.add(id);
  return Array.from(set);
}

function asKind(value: unknown, personal: unknown): WorkspaceKind {
  if (value === "personal" || value === "business") return value;
  return personal === true ? "personal" : "business";
}

function asSubscriptionStatus(value: unknown): SubscriptionStatus {
  if (
    value === "trialing" ||
    value === "active" ||
    value === "past_due" ||
    value === "canceled"
  ) {
    return value;
  }
  return "none";
}

/** Load profile + workspace memberships into the local member roster for nav/ACL. */
export async function hydrateMemberFromSupabase(user: User): Promise<Member> {
  const supabase = createSupabaseBrowserClient();
  const base = memberFromSupabaseUser(user);

  const [profileResult, membershipResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, email, plan, role")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("workspace_members")
      .select("workspace_id, role, spaces")
      .eq("profile_id", user.id),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (membershipResult.error) throw membershipResult.error;

  // Optional billing columns (010+) — ignore if migration not applied yet.
  const { data: billing } = await supabase
    .from("profiles")
    .select(
      "subscription_status, subscription_period_end, cancel_at_period_end",
    )
    .eq("id", user.id)
    .maybeSingle();

  const profile = profileResult.data
    ? { ...profileResult.data, ...(billing ?? {}) }
    : profileResult.data;
  const memberships = membershipResult.data ?? [];
  const workspaceIds = memberships.map((row) => String(row.workspace_id));
  const plan = asPlan(profile?.plan);
  const teamPlan = isTeamPlan(plan);

  if (workspaceIds.length) {
    const { data: workspaces, error: wsError } = await supabase
      .from("workspaces")
      .select("id, name, kind, personal, spaces, budget, spend")
      .in("id", workspaceIds);
    if (wsError) throw wsError;

    for (const row of workspaces ?? []) {
      const kind = asKind(row.kind, row.personal);
      upsertCatalogWorkspace({
        id: String(row.id),
        name: String(row.name),
        spaces: asSpaces(row.spaces),
        members: 1,
        budget: typeof row.budget === "string" ? row.budget : "$0",
        spend: typeof row.spend === "string" ? row.spend : "$0",
        kind,
        ...(kind === "personal" ? { personal: true } : {}),
      });
    }
  }

  const member: Member = {
    ...base,
    name: String(profile?.name || base.name),
    email: String(profile?.email || base.email),
    plan,
    role: asRole(profile?.role ?? memberships[0]?.role),
    workspaceIds,
    kind: teamPlan ? "org" : "personal",
    seatStatus: "active",
    subscriptionStatus: asSubscriptionStatus(profile?.subscription_status),
    subscriptionPeriodEnd:
      typeof profile?.subscription_period_end === "string"
        ? profile.subscription_period_end
        : undefined,
    cancelAtPeriodEnd: profile?.cancel_at_period_end === true,
  };

  for (const row of memberships) {
    const wsId = String(row.workspace_id);
    ensurePolicy(wsId, member.id, asSpaces(row.spaces));
  }

  upsertOrgMember(member);

  // Replace local roster from real org_members (pending invites included).
  const { data: selfOrg } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const orgId = selfOrg?.org_id ? String(selfOrg.org_id) : undefined;
  if (orgId) {
    persistOrgId(orgId);
    const [{ data: orgRows }, { data: org }] = await Promise.all([
      supabase.from("org_members").select("*").eq("org_id", orgId),
      supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    ]);
    if (org?.name) persistOrgName(String(org.name));
    if (orgRows?.length) {
      const remoteMembers = (orgRows as OrgMemberRow[]).map(memberRowToMember);
      const merged = remoteMembers.some((item) => item.id === member.id)
        ? remoteMembers.map((item) =>
            item.id === member.id ? { ...item, ...member, orgId } : { ...item, orgId },
          )
        : [{ ...member, orgId }, ...remoteMembers.map((item) => ({ ...item, orgId }))];
      replacePolicyStoreState({
        policies: getPoliciesSnapshot(),
        orgMembers: merged,
      });
    } else {
      upsertOrgMember({ ...member, orgId });
    }
  }

  if (workspaceIds.length) {
    const current = getWorkspaceSnapshot();
    if (!workspaceIds.includes(current)) {
      persistWorkspace(workspaceIds[0]!);
    }
  }

  return member;
}

/** Persist onboarding plan + grant full nav spaces on the user's workspaces. */
export async function applySignupPlanAndSpaces(opts: {
  userId: string;
  name: string;
  email: string;
  plan: BillingPlan;
  workspaceName?: string;
  workspaceKind?: WorkspaceKind;
}) {
  const supabase = createSupabaseBrowserClient();
  const teamPlan = isTeamPlan(opts.plan);
  const navSpaces = [...NAV_SPACES];

  // Prefer server finish (service role) so missing client GRANTs cannot block Enter.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    const response = await fetch("/api/onboarding/finish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name: opts.name,
        email: opts.email,
        plan: opts.plan,
        workspaceName: opts.workspaceName,
        workspaceKind: opts.workspaceKind,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      const ids: string[] = Array.isArray(data.workspaceIds)
        ? data.workspaceIds.map(String)
        : [];
      finalizeLocalMember(opts, ids.length ? ids : [`ws-${opts.userId.replace(/-/g, "")}`], teamPlan);
      return;
    }

    const apiError =
      typeof data.error === "string" ? data.error : `HTTP ${response.status}`;
    const privilegeDenied = /permission denied|42501/i.test(apiError);

    // DB privileges revoked — do not fall back to client (same failure). Enter with
    // auth-local member so onboarding can complete; apply scripts/fix-supabase-grants.sql.
    if (privilegeDenied) {
      console.warn(
        "[cander] DB privileges missing — finishing with local member. Run scripts/fix-supabase-grants.sql",
        apiError,
      );
      finalizeLocalMember(
        opts,
        [`ws-${opts.userId.replace(/-/g, "")}`],
        teamPlan,
      );
      return;
    }

    console.warn(
      "[cander] onboarding finish API failed, trying client writes",
      apiError,
    );
  }

  await applySignupPlanAndSpacesClient(opts);
}

function finalizeLocalMember(
  opts: {
    userId: string;
    name: string;
    email: string;
    plan: BillingPlan;
    workspaceName?: string;
  },
  ids: string[],
  teamPlan: boolean,
) {
  const initials = opts.name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  upsertOrgMember({
    id: opts.userId,
    name: opts.name.trim(),
    email: opts.email.trim(),
    short: opts.name.trim().split(/\s+/)[0] || "User",
    initials: initials || "U",
    role: "Owner",
    plan: opts.plan,
    seatStatus: "active",
    kind: teamPlan ? "org" : "personal",
    workspaceIds: ids,
    subscriptionStatus: opts.plan === "free" ? "none" : "active",
  });

  for (const workspaceId of ids) {
    ensurePolicy(workspaceId, opts.userId, [...NAV_SPACES]);
    upsertCatalogWorkspace({
      id: workspaceId,
      name: opts.workspaceName?.trim() || "Personal",
      spaces: [...NAV_SPACES],
      members: 1,
      budget: "$0",
      spend: "$0",
      kind: teamPlan ? "business" : "personal",
      ...(!teamPlan ? { personal: true } : {}),
    });
  }

  if (ids[0]) persistWorkspace(ids[0]);
}

async function applySignupPlanAndSpacesClient(opts: {
  userId: string;
  name: string;
  email: string;
  plan: BillingPlan;
  workspaceName?: string;
  workspaceKind?: WorkspaceKind;
}) {
  const supabase = createSupabaseBrowserClient();
  const teamPlan = isTeamPlan(opts.plan);
  const navSpaces = [...NAV_SPACES];

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      name: opts.name.trim(),
      role: "Owner",
      ...(opts.plan === "free" ? { plan: "free" } : {}),
    })
    .eq("id", opts.userId);

  if (profileError) {
    const denied = /permission denied|42501/i.test(profileError.message);
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("profile_id", opts.userId)
      .limit(1);
    if (denied && (memberships?.length ?? 0) > 0) {
      console.warn(
        "[cander] profiles update denied — entering with existing workspace. Apply migration 012_profiles_grants.sql",
        profileError.message,
      );
      finalizeLocalMember(
        opts,
        memberships!.map((row) => String(row.workspace_id)),
        teamPlan,
      );
      return;
    }
    throw profileError;
  }

  // Billing columns land in migration 010 — best-effort until applied.
  if (opts.plan === "free") {
    const { error: statusError } = await supabase
      .from("profiles")
      .update({ subscription_status: "none" })
      .eq("id", opts.userId);
    if (statusError) {
      console.warn(
        "[cander] subscription_status update skipped — apply migration 010_billing.sql",
        statusError.message,
      );
    }
  }

  const { data: memberships, error: listError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("profile_id", opts.userId);
  if (listError) throw listError;

  let ids = (memberships ?? []).map((row) => String(row.workspace_id));

  // Trigger usually creates the personal workspace; create one if signup raced ahead.
  if (!ids.length) {
    const wsId = `ws-${opts.userId.replace(/-/g, "")}`;
    const kind = opts.workspaceKind ?? (teamPlan ? "business" : "personal");
    const name =
      opts.workspaceName?.trim() ||
      (kind === "personal" ? "Personal" : "Workspace");
    const { error: createWsError } = await supabase.from("workspaces").upsert({
      id: wsId,
      name,
      kind,
      personal: kind === "personal",
      spaces: navSpaces,
    });
    if (createWsError) throw createWsError;
    const { error: createMemError } = await supabase
      .from("workspace_members")
      .upsert({
        workspace_id: wsId,
        profile_id: opts.userId,
        role: "Owner",
        spaces: navSpaces,
      });
    if (createMemError) throw createMemError;
    ids.push(wsId);
  }

  for (const workspaceId of ids) {
    const kind = opts.workspaceKind ?? (teamPlan ? "business" : "personal");
    const patch: Record<string, unknown> = {
      spaces: navSpaces,
      kind,
      personal: kind === "personal",
    };
    if (opts.workspaceName?.trim()) {
      patch.name = opts.workspaceName.trim();
    }
    const { error: wsError } = await supabase
      .from("workspaces")
      .update(patch)
      .eq("id", workspaceId);
    if (wsError) {
      console.warn("[cander] workspace update skipped", wsError.message);
    }

    const { error } = await supabase
      .from("workspace_members")
      .update({
        role: "Owner",
        spaces: navSpaces,
      })
      .eq("workspace_id", workspaceId)
      .eq("profile_id", opts.userId);
    if (error) {
      console.warn("[cander] membership update skipped", error.message);
    }
  }

  finalizeLocalMember(opts, ids, teamPlan);
}
