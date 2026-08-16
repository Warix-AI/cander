import { members } from "./data";
import type {
  KnowledgeAccess,
  KnowledgeBase,
  WorkspaceMemberPolicy,
  WorkspacePolicy,
  WorkspaceSeatRole,
} from "./types";

type Listener = () => void;

export const emptyPolicy = (): WorkspacePolicy => ({
  knowledgeBases: [],
  members: [],
  disabledConnectors: [],
});

const seedPolicies: Record<string, WorkspacePolicy> = {
  marketing: {
    knowledgeBases: [
      {
        id: "kb-brand",
        name: "Brand voice",
        summary: "Tone, claims we do not make, and Graphite language.",
        sources: 12,
        updatedAt: "2d ago",
      },
      {
        id: "kb-product",
        name: "Product facts",
        summary: "Cander pricing, plans, and approved feature copy.",
        sources: 8,
        updatedAt: "5h ago",
      },
      {
        id: "kb-campaigns",
        name: "Campaign archive",
        summary: "Past launches, stills, and cutdowns for reuse.",
        sources: 31,
        updatedAt: "Yesterday",
      },
    ],
    members: [
      { memberId: "m1", role: "admin", knowledge: "manage" },
      { memberId: "m2", role: "admin", knowledge: "manage" },
      { memberId: "m4", role: "member", knowledge: "use" },
      { memberId: "m6", role: "member", knowledge: "use" },
    ],
    disabledConnectors: ["github", "jira", "linear"],
  },
  engineering: {
    knowledgeBases: [
      {
        id: "kb-arch",
        name: "Architecture",
        summary: "Runtime topology, hosting, and service boundaries.",
        sources: 18,
        updatedAt: "1d ago",
      },
      {
        id: "kb-runbooks",
        name: "Runbooks",
        summary: "On-call steps, local runtime, and incident notes.",
        sources: 9,
        updatedAt: "3d ago",
      },
    ],
    members: [
      { memberId: "m1", role: "member", knowledge: "use" },
      { memberId: "m2", role: "admin", knowledge: "manage" },
      { memberId: "m3", role: "admin", knowledge: "manage" },
      { memberId: "m5", role: "member", knowledge: "use" },
    ],
    disabledConnectors: ["hubspot", "gmail"],
  },
  operations: {
    knowledgeBases: [
      {
        id: "kb-vendors",
        name: "Vendor policy",
        summary: "Who we may connect, retention, and review cadence.",
        sources: 6,
        updatedAt: "1w ago",
      },
    ],
    members: [
      { memberId: "m1", role: "viewer", knowledge: "use" },
      { memberId: "m2", role: "admin", knowledge: "manage" },
      { memberId: "m5", role: "member", knowledge: "use" },
      { memberId: "m6", role: "member", knowledge: "none" },
    ],
    disabledConnectors: ["figma", "discord"],
  },
};

const listeners = new Set<Listener>();
let policies: Record<string, WorkspacePolicy> = structuredClone(seedPolicies);

function emit() {
  listeners.forEach((listener) => listener());
}

function persist() {
  window.localStorage.setItem(
    "courier-workspace-policies",
    JSON.stringify(policies),
  );
  emit();
}

function hydrate(raw: unknown): Record<string, WorkspacePolicy> {
  const next = structuredClone(seedPolicies);
  if (!raw || typeof raw !== "object") return next;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const policy = value as Partial<WorkspacePolicy>;
    next[id] = {
      knowledgeBases: Array.isArray(policy.knowledgeBases)
        ? policy.knowledgeBases
        : (next[id]?.knowledgeBases ?? []),
      members: Array.isArray(policy.members)
        ? policy.members
        : (next[id]?.members ?? []),
      disabledConnectors: Array.isArray(policy.disabledConnectors)
        ? policy.disabledConnectors
        : (next[id]?.disabledConnectors ?? []),
    };
  }
  return next;
}

export function subscribePolicies(listener: Listener) {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("courier-workspace-policies");
    if (stored) {
      try {
        policies = hydrate(JSON.parse(stored));
      } catch {
        policies = structuredClone(seedPolicies);
      }
    }
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPoliciesSnapshot() {
  return policies;
}

export function getPoliciesServerSnapshot() {
  return seedPolicies;
}

export function policyFor(
  workspaceId: string,
  map: Record<string, WorkspacePolicy> = policies,
): WorkspacePolicy {
  const base = map[workspaceId] ?? emptyPolicy();
  const assigned = members.filter((member) =>
    member.workspaceIds.includes(workspaceId),
  );
  if (!assigned.length) return base;
  const listed = assigned.map((member) => {
    const existing = base.members.find((row) => row.memberId === member.id);
    if (existing) return existing;
    const role: WorkspaceSeatRole =
      member.role === "Owner" || member.role === "Admin" ? "admin" : "member";
    return { memberId: member.id, role, knowledge: "use" as const };
  });
  return { ...base, members: listed };
}

export function ensurePolicy(workspaceId: string, adminId?: string) {
  if (policies[workspaceId]) return;
  const admin = adminId
    ? [{ memberId: adminId, role: "admin" as const, knowledge: "manage" as const }]
    : [];
  policies = {
    ...policies,
    [workspaceId]: { ...emptyPolicy(), members: admin },
  };
  persist();
}

export function addKnowledgeBase(workspaceId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const current = policyFor(workspaceId);
  const next: KnowledgeBase = {
    id: `kb-${Date.now()}`,
    name: trimmed,
    summary: "Internal sources for this workspace.",
    sources: 0,
    updatedAt: "Just now",
  };
  policies = {
    ...policies,
    [workspaceId]: {
      ...current,
      knowledgeBases: [...current.knowledgeBases, next],
    },
  };
  persist();
}

export function removeKnowledgeBase(workspaceId: string, knowledgeId: string) {
  const current = policyFor(workspaceId);
  policies = {
    ...policies,
    [workspaceId]: {
      ...current,
      knowledgeBases: current.knowledgeBases.filter(
        (item) => item.id !== knowledgeId,
      ),
    },
  };
  persist();
}

export function setMemberPolicy(
  workspaceId: string,
  memberId: string,
  patch: Partial<Pick<WorkspaceMemberPolicy, "role" | "knowledge">>,
) {
  const current = policyFor(workspaceId);
  policies = {
    ...policies,
    [workspaceId]: {
      ...current,
      members: current.members.map((row) =>
        row.memberId === memberId ? { ...row, ...patch } : row,
      ),
    },
  };
  persist();
}

export function toggleDisabledConnector(
  workspaceId: string,
  connectorId: string,
) {
  const current = policyFor(workspaceId);
  const disabled = current.disabledConnectors.includes(connectorId)
    ? current.disabledConnectors.filter((id) => id !== connectorId)
    : [...current.disabledConnectors, connectorId];
  policies = {
    ...policies,
    [workspaceId]: { ...current, disabledConnectors: disabled },
  };
  persist();
}

export function connectorDisabled(
  map: Record<string, WorkspacePolicy>,
  workspaceId: string,
  connectorId: string,
) {
  return policyFor(workspaceId, map).disabledConnectors.includes(connectorId);
}

export const roleLabel: Record<WorkspaceSeatRole, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export const knowledgeLabel: Record<KnowledgeAccess, string> = {
  manage: "Manage",
  use: "Use",
  none: "None",
};
