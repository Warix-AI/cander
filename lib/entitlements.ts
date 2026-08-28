import { accountPresets, workspaceResources } from "./data";
import {
  capabilitiesFor,
  hasKnowledgeBases,
  hasOrganizationControls,
  hasSharedWorkspaces,
  hasVisibleWorkspaces,
  hasVoice,
  workspaceLimit,
  type AiCapacity,
} from "./plan-entitlements";
import { isPaidPlan, isTeamPlan } from "./plans";
import type {
  AccountPresetId,
  BillingPlan,
  Member,
  Workspace,
  WorkspaceResource,
} from "./types";
import { getWorkspaceCatalogSnapshot } from "./workspace-catalog";
import {
  emailFitsWorkspaceKind,
  workspaceKindOf,
} from "./workspace-kind";
import { canEditWorkspaceSettings as canEditWorkspaceForRoles } from "./workspace-membership";

export type Entitlements = {
  plan: BillingPlan;
  role: Member["role"];
  inOrg: boolean;
  orgActive: boolean;
  pendingInvite: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isMember: boolean;
  aiCapacity: AiCapacity;
  hasVoice: boolean;
  hasPersistentMemory: boolean;
  hasAdvancedMemory: boolean;
  hasKnowledgeBases: boolean;
  canUseSharedWorkspaces: boolean;
  canInviteMembers: boolean;
  canManageRoles: boolean;
  hasSharedWorkspaceKnowledge: boolean;
  showOrganizationControls: boolean;
  canCreatePersonalWorkspace: boolean;
  canCreateBusinessWorkspace: boolean;
  canManageBilling: boolean;
  canManageMembers: boolean;
  canManageWorkspaces: boolean;
  hasConnectorPolicies: boolean;
  workspaceCap: number;
  /** Max owner/admin — full org controls. */
  showOrgAdmin: boolean;
  /** Pro/Max org member — read-only managed-by view. */
  showOrgManaged: boolean;
  /** @deprecated Use showOrgAdmin || showOrgManaged */
  showOrgSettings: boolean;
  showWorkspacesAdmin: boolean;
  showPlansBilling: boolean;
  showInviteWall: boolean;
  canUseSharedResource: (resourceId: string) => boolean;
  /** Pro/Max only — Free keeps a hidden First Workspace under the hood. */
  hasWorkspaces: boolean;
  canDeleteAccount: boolean;
  canEditWorkspaceSettings: (workspaceId: string) => boolean;
};

function subscriptionActive(actor: Member) {
  return (
    actor.subscriptionStatus === "active" ||
    actor.subscriptionStatus === "trialing"
  );
}

/** Paid subscription still billing — blocks account deletion until period ends. */
export function subscriptionBlocksAccountDeletion(actor: Member): boolean {
  if (!isPaidPlan(actor.plan)) return false;
  if (!subscriptionActive(actor)) return false;
  if (actor.cancelAtPeriodEnd && actor.subscriptionPeriodEnd) {
    return new Date(actor.subscriptionPeriodEnd).getTime() > Date.now();
  }
  return true;
}

/** Paid plan without active subscription is treated as Free for capabilities. */
export function effectivePlan(actor: Member): BillingPlan {
  if (actor.plan === "free") return "free";
  if (actor.kind === "org" && actor.role !== "Owner") {
    return actor.seatStatus === "active" ? actor.plan : "free";
  }
  // Downgrade only when billing is known-bad. Unset / `none` still honors the
  // selected plan so pre-Stripe onboarding and bypass checkout unlock Pro/Max.
  if (
    isPaidPlan(actor.plan) &&
    (actor.subscriptionStatus === "canceled" ||
      actor.subscriptionStatus === "past_due")
  ) {
    return "free";
  }
  return actor.plan;
}

export function entitlementsFor(actor: Member): Entitlements {
  const plan = effectivePlan(actor);
  const caps = capabilitiesFor(plan);
  const inOrg = actor.kind === "org";
  const seatActive = actor.seatStatus === "active";
  const pendingInvite = inOrg && actor.seatStatus === "pending";
  const orgOwnerOrAdmin =
    inOrg &&
    plan === "max" &&
    seatActive &&
    (actor.role === "Owner" || actor.role === "Admin");
  const orgAdminFromDeferred =
    Boolean(actor.orgSetupDeferred) &&
    plan === "max" &&
    actor.role === "Owner" &&
    seatActive;
  const showOrgAdmin =
    (orgOwnerOrAdmin || orgAdminFromDeferred) &&
    hasOrganizationControls(plan);
  const showOrgManaged =
    inOrg && seatActive && !showOrgAdmin && (plan === "pro" || plan === "max");
  const orgActive =
    inOrg && isTeamPlan(plan) && seatActive;
  const isOwner = orgActive && actor.role === "Owner";
  const isAdmin = orgActive && actor.role === "Admin";
  const isMember = orgActive && actor.role === "Member";
  const canCreate = !pendingInvite && hasVisibleWorkspaces(plan);

  return {
    plan,
    role: actor.role,
    inOrg,
    orgActive,
    pendingInvite,
    isOwner,
    isAdmin,
    isMember,
    aiCapacity: caps.aiCapacity,
    hasVoice: hasVoice(plan),
    hasPersistentMemory: caps.persistentMemory,
    hasAdvancedMemory: caps.advancedMemory,
    hasKnowledgeBases: hasKnowledgeBases(plan),
    canUseSharedWorkspaces: orgActive && hasSharedWorkspaces(plan),
    canInviteMembers: showOrgAdmin && caps.inviteMembers,
    canManageRoles: showOrgAdmin && caps.rolesAndPermissions,
    hasSharedWorkspaceKnowledge:
      orgActive && caps.sharedWorkspaceKnowledge,
    showOrganizationControls: showOrgAdmin,
    canCreatePersonalWorkspace: canCreate,
    canCreateBusinessWorkspace: canCreate,
    canManageBilling: isOwner || orgAdminFromDeferred,
    canManageMembers: showOrgAdmin && caps.rolesAndPermissions,
    canManageWorkspaces: showOrgAdmin && caps.organizationControls,
    hasConnectorPolicies: showOrgAdmin && caps.organizationControls,
    workspaceCap: workspaceLimit(plan),
    showOrgAdmin,
    showOrgManaged,
    showOrgSettings: showOrgAdmin || showOrgManaged,
    showWorkspacesAdmin: showOrgAdmin && caps.organizationControls,
    showPlansBilling: true,
    showInviteWall: pendingInvite,
    hasWorkspaces: canCreate,
    canDeleteAccount:
      !(inOrg && actor.role !== "Owner") &&
      !subscriptionBlocksAccountDeletion(actor),
    canEditWorkspaceSettings: (workspaceId) =>
      canEditWorkspaceForRoles(actor.workspaceRoles, workspaceId),
    canUseSharedResource: (resourceId) => {
      const resource = workspaceResources.find((item) => item.id === resourceId);
      if (!resource) return false;
      if (resource.ownerId === actor.id) return true;
      if (!resource.authorizedMemberIds.includes(actor.id)) return false;
      return orgActive && caps.sharedWorkspaceKnowledge;
    },
  };
}

export function orgMembersOf(members: Member[]) {
  return members.filter((item) => item.kind === "org");
}

export function orgMaxSeats(members: Member[]) {
  return orgMembersOf(members).filter(
    (item) => item.plan === "max" && item.seatStatus === "active",
  ).length;
}

export function sharedResourcesFor(
  workspaceId: string,
  actor: Member,
  access: Entitlements,
): WorkspaceResource[] {
  return workspaceResources.filter((item) => {
    if (item.workspaceId !== workspaceId || item.status !== "active") return false;
    return access.canUseSharedResource(item.id);
  });
}

export function workspacesFor(actor: Member, _access: Entitlements): Workspace[] {
  const workspaces = getWorkspaceCatalogSnapshot();
  return workspaces.filter((item) => actor.workspaceIds.includes(item.id));
}

export function canInviteEmailToWorkspace(
  workspace: Workspace,
  email: string,
): string | null {
  const kind = workspaceKindOf(workspace);
  if (emailFitsWorkspaceKind(kind, email)) return null;
  if (kind === "business") {
    return "Business workspaces only accept company email addresses.";
  }
  return "Personal workspaces only accept personal email addresses.";
}

export function homeWorkspaceId(actor: Member, access: Entitlements) {
  const allowed = workspacesFor(actor, access);
  return allowed[0]?.id ?? actor.workspaceIds[0] ?? "";
}

export function presetForActor(actorId: string): AccountPresetId {
  return (
    accountPresets.find((item) => item.actorId === actorId)?.id ?? "max-owner"
  );
}

export function memberName(memberId: string, members: Member[]) {
  return members.find((item) => item.id === memberId)?.name ?? memberId;
}

/** True when the actor may add another workspace under their plan cap. */
export function canAddWorkspace(
  actor: Member,
  access: Entitlements,
  currentCount: number,
) {
  if (access.pendingInvite) return false;
  const cap = access.workspaceCap;
  if (cap === Infinity) return true;
  return currentCount < cap;
}
