import type { BillingPlan } from "./types";

export type AiCapacity = "standard" | "expanded" | "maximum";

/** Internal plan capabilities — comparison UI uses boolean rows derived from these. */
export type PlanCapabilities = {
  aiCapacity: AiCapacity;
  voice: boolean;
  /** 1, 3, or Infinity — never shown in pricing cells. */
  workspaceLimit: number;
  persistentMemory: boolean;
  advancedMemory: boolean;
  knowledgeBases: boolean;
  sharedWorkspaces: boolean;
  inviteMembers: boolean;
  rolesAndPermissions: boolean;
  sharedWorkspaceKnowledge: boolean;
  organizationControls: boolean;
};

const PLAN_CAPABILITIES: Record<BillingPlan, PlanCapabilities> = {
  free: {
    aiCapacity: "standard",
    voice: false,
    workspaceLimit: 1,
    persistentMemory: true,
    advancedMemory: false,
    knowledgeBases: false,
    sharedWorkspaces: false,
    inviteMembers: false,
    rolesAndPermissions: false,
    sharedWorkspaceKnowledge: false,
    organizationControls: false,
  },
  pro: {
    aiCapacity: "expanded",
    voice: true,
    workspaceLimit: 3,
    persistentMemory: true,
    advancedMemory: true,
    knowledgeBases: true,
    sharedWorkspaces: false,
    inviteMembers: false,
    rolesAndPermissions: false,
    sharedWorkspaceKnowledge: false,
    organizationControls: false,
  },
  max: {
    aiCapacity: "maximum",
    voice: true,
    workspaceLimit: Infinity,
    persistentMemory: true,
    advancedMemory: true,
    knowledgeBases: true,
    sharedWorkspaces: true,
    inviteMembers: true,
    rolesAndPermissions: true,
    sharedWorkspaceKnowledge: true,
    organizationControls: true,
  },
};

export function capabilitiesFor(plan: BillingPlan): PlanCapabilities {
  return PLAN_CAPABILITIES[plan];
}

export function hasExpandedAiCapacity(plan: BillingPlan) {
  const tier = capabilitiesFor(plan).aiCapacity;
  return tier === "expanded" || tier === "maximum";
}

export function hasMaximumAiCapacity(plan: BillingPlan) {
  return capabilitiesFor(plan).aiCapacity === "maximum";
}

export function hasVoice(plan: BillingPlan) {
  return capabilitiesFor(plan).voice;
}

export function workspaceLimit(plan: BillingPlan) {
  return capabilitiesFor(plan).workspaceLimit;
}

export function hasMultipleWorkspaces(plan: BillingPlan) {
  return capabilitiesFor(plan).workspaceLimit > 1;
}

/** Pro/Max show workspace chrome; Free keeps one hidden workspace under the hood. */
export function hasVisibleWorkspaces(plan: BillingPlan) {
  return plan !== "free";
}

export function hasUnlimitedWorkspaces(plan: BillingPlan) {
  return capabilitiesFor(plan).workspaceLimit === Infinity;
}

export function hasKnowledgeBases(plan: BillingPlan) {
  return capabilitiesFor(plan).knowledgeBases;
}

export function hasSharedWorkspaces(plan: BillingPlan) {
  return capabilitiesFor(plan).sharedWorkspaces;
}

export function hasOrganizationControls(plan: BillingPlan) {
  return capabilitiesFor(plan).organizationControls;
}

export function nextPlanTier(plan: BillingPlan): BillingPlan | null {
  if (plan === "free") return "pro";
  if (plan === "pro") return "max";
  return null;
}

/** Pricing comparison rows — plan cells are boolean only. */
export function planComparisonRows(): {
  label: string;
  values: Record<BillingPlan, boolean>;
}[] {
  const all = (values: Record<BillingPlan, boolean>) => values;
  return [
    {
      label: "Unlimited AI usage",
      values: all({ free: true, pro: true, max: true }),
    },
    {
      label: "Expanded AI capacity",
      values: all({ free: false, pro: true, max: true }),
    },
    {
      label: "Maximum AI capacity",
      values: all({ free: false, pro: false, max: true }),
    },
    { label: "Chat", values: all({ free: true, pro: true, max: true }) },
    { label: "Work", values: all({ free: true, pro: true, max: true }) },
    { label: "Create", values: all({ free: true, pro: true, max: true }) },
    { label: "Explore", values: all({ free: true, pro: true, max: true }) },
    {
      label: "Connectors",
      values: all({ free: true, pro: true, max: true }),
    },
    { label: "Pins", values: all({ free: true, pro: true, max: true }) },
    { label: "Recents", values: all({ free: true, pro: true, max: true }) },
    {
      label: "Workspaces",
      values: all({ free: false, pro: true, max: true }),
    },
    {
      label: "Multiple workspaces",
      values: all({ free: false, pro: true, max: true }),
    },
    {
      label: "Unlimited workspaces",
      values: all({ free: false, pro: false, max: true }),
    },
    { label: "Voice", values: all({ free: false, pro: true, max: true }) },
    {
      label: "Persistent memory",
      values: all({ free: true, pro: true, max: true }),
    },
    {
      label: "Advanced memory",
      values: all({ free: false, pro: true, max: true }),
    },
    {
      label: "Knowledge bases",
      values: all({ free: false, pro: true, max: true }),
    },
    {
      label: "Shared workspaces",
      values: all({ free: false, pro: false, max: true }),
    },
    {
      label: "Invite members",
      values: all({ free: false, pro: false, max: true }),
    },
    {
      label: "Roles & permissions",
      values: all({ free: false, pro: false, max: true }),
    },
    {
      label: "Shared workspace knowledge",
      values: all({ free: false, pro: false, max: true }),
    },
    {
      label: "Organization controls",
      values: all({ free: false, pro: false, max: true }),
    },
  ];
}
