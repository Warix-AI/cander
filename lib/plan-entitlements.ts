import type { BillingPlan } from "./types";
import { canonicalizePlan } from "./billing/plan-catalog.ts";

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
  minimal: {
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
  light: {
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
  moderate: {
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
  heavy: {
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
  limitless: {
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
  return PLAN_CAPABILITIES[canonicalizePlan(plan)];
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

/** Light+ show workspace chrome; Minimal keeps one hidden workspace under the hood. */
export function hasVisibleWorkspaces(plan: BillingPlan) {
  return canonicalizePlan(plan) !== "minimal";
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
  const p = canonicalizePlan(plan);
  if (p === "minimal") return "light";
  if (p === "light") return "moderate";
  if (p === "moderate") return "heavy";
  if (p === "heavy") return "limitless";
  return null;
}

type SelfServeCompare = "minimal" | "light" | "moderate" | "heavy";

/** Pricing comparison rows — self-serve plans only in marketing matrix. */
export function planComparisonRows(): {
  label: string;
  values: Record<SelfServeCompare, boolean>;
}[] {
  const all = (values: Record<SelfServeCompare, boolean>) => values;
  return [
    {
      label: "Active AI Minutes included",
      values: all({
        minimal: true,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Expanded AI capacity",
      values: all({
        minimal: false,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Maximum AI capacity",
      values: all({
        minimal: false,
        light: false,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Highest self-serve capacity",
      values: all({
        minimal: false,
        light: false,
        moderate: false,
        heavy: true,
      }),
    },
    {
      label: "Chat",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Work",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Create",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Explore",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Connectors",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Pins",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Recents",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Workspaces",
      values: all({
        minimal: false,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Multiple workspaces",
      values: all({
        minimal: false,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Unlimited workspaces",
      values: all({
        minimal: false,
        light: false,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Voice",
      values: all({
        minimal: false,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Persistent memory",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Advanced memory",
      values: all({
        minimal: false,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Knowledge bases",
      values: all({
        minimal: false,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Shared workspaces",
      values: all({
        minimal: false,
        light: false,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Invite members",
      values: all({
        minimal: false,
        light: false,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Roles & permissions",
      values: all({
        minimal: false,
        light: false,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Shared workspace knowledge",
      values: all({
        minimal: false,
        light: false,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Organization controls",
      values: all({
        minimal: false,
        light: false,
        moderate: true,
        heavy: true,
      }),
    },
  ];
}
