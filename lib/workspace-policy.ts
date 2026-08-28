import { getWorkspaceCatalogSnapshot } from "./workspace-catalog";
import { ALL_SPACE_IDS } from "./spaces";
import { normalizePlan, isTeamPlan } from "@/lib/plans";
import { hasOrganizationControls } from "@/lib/plan-entitlements";
import type {
  BillingPlan,
  KnowledgeBase,
  KnowledgeFile,
  Member,
  Role,
  SeatStatus,
  SpaceId,
  WorkspaceMemberPolicy,
  WorkspacePolicy,
} from "./types";

type Listener = () => void;

const ALL_SPACES: SpaceId[] = [...ALL_SPACE_IDS];

const SPACE_SET = new Set<string>(ALL_SPACES);

export const emptyPolicy = (): WorkspacePolicy => ({
  knowledgeBases: [],
  members: [],
  disabledConnectors: [],
});

const listeners = new Set<Listener>();
let policies: Record<string, WorkspacePolicy> = {};
let orgMembers: Member[] = [];
let policyRevision = 0;

function emit() {
  listeners.forEach((listener) => listener());
}

function persist() {
  window.localStorage.setItem(
    "courier-workspace-policies",
    JSON.stringify(policies),
  );
  window.localStorage.setItem("courier-org-members", JSON.stringify(orgMembers));
  policyRevision += 1;
  emit();
}

/** Replace policy state (Supabase hydrate). Writes localStorage for offline reads. */
export function replacePolicyStoreState(next: {
  policies: Record<string, WorkspacePolicy>;
  orgMembers: Member[];
}) {
  policies = next.policies;
  orgMembers = next.orgMembers;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      "courier-workspace-policies",
      JSON.stringify(policies),
    );
    window.localStorage.setItem("courier-org-members", JSON.stringify(orgMembers));
  }
  policyRevision += 1;
  emit();
}

/** Wipe in-memory policy state on sign-out so the next user starts clean. */
export function resetPolicyStoreState() {
  replacePolicyStoreState({ policies: {}, orgMembers: [] });
}

export function getPolicyStoreRevision() {
  return policyRevision;
}

export function subscribePolicyStore(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function asSpaceList(value: unknown, fallback: SpaceId[]): SpaceId[] {
  if (!Array.isArray(value)) return fallback;
  const next = value.filter((id): id is SpaceId => SPACE_SET.has(String(id)));
  return withCatalogSpaces(next, fallback);
}

function withCatalogSpaces(spaces: SpaceId[], fallback: SpaceId[]): SpaceId[] {
  const next = [...spaces];
  const ensure = (id: SpaceId) => {
    if (fallback.includes(id) && !next.includes(id)) next.push(id);
  };
  for (const id of ALL_SPACE_IDS) ensure(id);
  return next;
}

function asFiles(value: unknown): KnowledgeFile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Partial<KnowledgeFile>;
    if (!row.id || !row.name) return [];
    return [
      {
        id: String(row.id),
        name: String(row.name),
        size: String(row.size ?? "—"),
        uploadedAt: String(row.uploadedAt ?? "Just now"),
      },
    ];
  });
}

function asKnowledge(value: unknown): KnowledgeBase[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Partial<KnowledgeBase>;
    if (!row.id || !row.name) return [];
    const files = asFiles(row.files);
    return [
      {
        id: String(row.id),
        name: String(row.name),
        summary: String(row.summary ?? ""),
        sources: typeof row.sources === "number" ? row.sources : files.length,
        updatedAt: String(row.updatedAt ?? "Just now"),
        files,
      },
    ];
  });
}

function asMemberRows(
  value: unknown,
  fallbackSpaces: SpaceId[],
): WorkspaceMemberPolicy[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Partial<WorkspaceMemberPolicy> & { memberId?: string };
    if (!row.memberId) return [];
    return [
      {
        memberId: String(row.memberId),
        spaces: asSpaceList(row.spaces, fallbackSpaces),
      },
    ];
  });
}

function hydrate(raw: unknown): Record<string, WorkspacePolicy> {
  const next: Record<string, WorkspacePolicy> = {};
  if (!raw || typeof raw !== "object") return next;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const policy = value as Partial<WorkspacePolicy>;
    const fallback =
      getWorkspaceCatalogSnapshot().find((item) => item.id === id)?.spaces ??
      ALL_SPACES;
    next[id] = {
      knowledgeBases: Array.isArray(policy.knowledgeBases)
        ? asKnowledge(policy.knowledgeBases)
        : (next[id]?.knowledgeBases ?? []),
      members: Array.isArray(policy.members)
        ? asMemberRows(policy.members, fallback)
        : (next[id]?.members ?? []),
      disabledConnectors: Array.isArray(policy.disabledConnectors)
        ? policy.disabledConnectors.map(String)
        : (next[id]?.disabledConnectors ?? []),
    };
  }
  return next;
}

function hydrateMembers(raw: unknown): Member[] {
  if (!Array.isArray(raw)) return [];
  const next: Member[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<Member>;
    if (!row.id) continue;
    // Drop legacy Acme demo roster ids
    const id = String(row.id);
    if (/^m[1-7]$/.test(id) || id.startsWith("p-")) continue;
    const role: Role =
      row.role === "Owner" || row.role === "Admin" || row.role === "Member"
        ? row.role
        : "Member";
    const plan: BillingPlan = normalizePlan(row.plan);
    const seatStatus: SeatStatus =
      row.seatStatus === "active" || row.seatStatus === "pending"
        ? row.seatStatus
        : "active";
    next.push({
      id,
      name: String(row.name ?? "Member"),
      email: String(row.email ?? ""),
      short: String(row.short ?? "Member"),
      initials: String(row.initials ?? "ME"),
      role,
      plan,
      seatStatus,
      kind: row.kind === "org" ? "org" : "personal",
      workspaceIds: Array.isArray(row.workspaceIds)
        ? row.workspaceIds.map(String)
        : [],
      ...(row.managedByOrgName
        ? { managedByOrgName: String(row.managedByOrgName) }
        : {}),
      ...(row.orgId ? { orgId: String(row.orgId) } : {}),
      ...(row.orgSetupDeferred ? { orgSetupDeferred: true } : {}),
      ...(row.subscriptionStatus
        ? { subscriptionStatus: row.subscriptionStatus }
        : {}),
    });
  }
  return next;
}

export function subscribePolicies(listener: Listener) {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("courier-workspace-policies");
    if (stored) {
      try {
        policies = hydrate(JSON.parse(stored));
        persist();
      } catch {
        policies = {};
      }
    }
    const storedMembers = window.localStorage.getItem("courier-org-members");
    window.localStorage.setItem("courier-org-members-v", "4");
    if (storedMembers) {
      try {
        orgMembers = hydrateMembers(JSON.parse(storedMembers));
        persist();
      } catch {
        orgMembers = [];
      }
    } else {
      orgMembers = [];
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

const EMPTY_POLICIES: Record<string, WorkspacePolicy> = {};

export function getPoliciesServerSnapshot() {
  return EMPTY_POLICIES;
}

/** Replace or insert a member in the org roster (Supabase session hydrate). */
export function upsertOrgMember(member: Member) {
  const index = orgMembers.findIndex((item) => item.id === member.id);
  if (index >= 0) {
    orgMembers = orgMembers.map((item) =>
      item.id === member.id
        ? {
            ...item,
            ...member,
            workspaceRoles: {
              ...item.workspaceRoles,
              ...member.workspaceRoles,
            },
          }
        : item,
    );
  } else {
    orgMembers = [member, ...orgMembers];
  }
  persist();
}

/** Draft invite from onboarding — pending until billing confirms seats. */
export function addPendingOrgInvite(opts: {
  email: string;
  name: string;
  plan: BillingPlan;
  orgName: string;
  workspaceIds: string[];
}) {
  const email = opts.email.trim().toLowerCase();
  if (!email.includes("@")) return;
  const name = opts.name.trim() || email.split("@")[0] || "Member";
  const id = `invite-${email.replace(/[^a-z0-9]/gi, "")}`;
  upsertOrgMember({
    id,
    name,
    email,
    short: name.split(/\s+/)[0] || "Member",
    initials: name.slice(0, 2).toUpperCase() || "IN",
    role: "Member",
    workspaceIds: opts.workspaceIds,
    plan: opts.plan === "max" ? "max" : "pro",
    seatStatus: "pending",
    kind: "org",
    managedByOrgName: opts.orgName,
  });
}

export function getMembersSnapshot() {
  return orgMembers;
}

const EMPTY_MEMBERS: Member[] = [];

export function getMembersServerSnapshot() {
  return EMPTY_MEMBERS;
}

function workspaceSpaces(workspaceId: string): SpaceId[] {
  return (
    getWorkspaceCatalogSnapshot().find((item) => item.id === workspaceId)
      ?.spaces ?? ALL_SPACES
  );
}

export function policyFor(
  workspaceId: string,
  map: Record<string, WorkspacePolicy> = policies,
): WorkspacePolicy {
  const base = map[workspaceId] ?? emptyPolicy();
  const fallback = workspaceSpaces(workspaceId);
  const assigned = orgMembers.filter((member) =>
    member.workspaceIds.includes(workspaceId),
  );
  if (!assigned.length) return { ...base, members: [] };
  const listed = assigned.map((member) => {
    const existing = base.members.find((row) => row.memberId === member.id);
    if (existing) {
      return {
        memberId: existing.memberId,
        spaces: withCatalogSpaces(
          existing.spaces.filter((id) => fallback.includes(id)),
          fallback,
        ),
      };
    }
    return { memberId: member.id, spaces: fallback };
  });
  return { ...base, members: listed };
}

export function memberSpaces(
  workspaceId: string,
  memberId: string,
  map: Record<string, WorkspacePolicy> = policies,
): SpaceId[] {
  const allowed = workspaceSpaces(workspaceId);
  const row = policyFor(workspaceId, map).members.find(
    (item) => item.memberId === memberId,
  );
  if (!row) return [];
  return allowed.filter((id) => row.spaces.includes(id));
}

export function ensurePolicy(
  workspaceId: string,
  adminId?: string,
  spaces: SpaceId[] = ALL_SPACES,
) {
  const existing = policies[workspaceId] ?? emptyPolicy();
  let members = existing.members;
  if (adminId) {
    const idx = members.findIndex((item) => item.memberId === adminId);
    if (idx >= 0) {
      members = members.map((item, i) =>
        i === idx ? { memberId: adminId, spaces: [...spaces] } : item,
      );
    } else {
      members = [...members, { memberId: adminId, spaces: [...spaces] }];
    }
    orgMembers = orgMembers.map((member) =>
      member.id === adminId && !member.workspaceIds.includes(workspaceId)
        ? { ...member, workspaceIds: [...member.workspaceIds, workspaceId] }
        : member,
    );
  }
  policies = {
    ...policies,
    [workspaceId]: { ...existing, members },
  };
  persist();
}

/** Remove stored policy and member assignments when a workspace is deleted. */
export function purgeWorkspace(workspaceId: string) {
  const nextPolicies = { ...policies };
  delete nextPolicies[workspaceId];
  policies = nextPolicies;
  orgMembers = orgMembers.map((member) => ({
    ...member,
    workspaceIds: member.workspaceIds.filter((id) => id !== workspaceId),
  }));
  persist();
}

export function setMemberRole(memberId: string, role: Role, actorId?: string) {
  const target = orgMembers.find((item) => item.id === memberId);
  if (!target) return;
  const actor = actorId
    ? orgMembers.find((item) => item.id === actorId)
    : undefined;
  if (actor) {
    if (target.role === "Owner" && actor.role !== "Owner") return;
    if (role === "Owner" && actor.role !== "Owner") return;
    if (actor.role === "Admin" && (role === "Owner" || target.role === "Owner")) {
      return;
    }
  }
  if (target.role === "Owner" && role !== "Owner") {
    const owners = orgMembers.filter(
      (item) =>
        item.role === "Owner" &&
        item.seatStatus === "active" &&
        item.plan === "max",
    );
    if (owners.length <= 1) return;
  }
  orgMembers = orgMembers.map((member) =>
    member.id === memberId ? { ...member, role } : member,
  );
  persist();
}

export function activateMaxSeat(memberId: string) {
  orgMembers = orgMembers.map((member) => {
    if (member.id !== memberId) return member;
    return {
      ...member,
      plan: "max" as const,
      seatStatus: "active" as const,
      role: member.role === "Owner" ? "Owner" : "Member",
      workspaceIds: member.workspaceIds,
    };
  });
  persist();
}

export function setMemberSeat(memberId: string, plan: BillingPlan) {
  orgMembers = orgMembers.map((member) => {
    if (member.id !== memberId) return member;
    if (isTeamPlan(plan)) {
      return {
        ...member,
        plan,
        seatStatus: "active",
        workspaceIds: member.workspaceIds,
      };
    }
    return {
      ...member,
      plan,
      seatStatus: member.kind === "org" ? "pending" : "active",
      workspaceIds: member.workspaceIds,
    };
  });
  persist();
}

/** Org roster Pro/Max seat change (keeps org membership). */
export function setMemberOrgPlan(
  memberId: string,
  plan: Extract<BillingPlan, "pro" | "max">,
) {
  orgMembers = orgMembers.map((member) =>
    member.id === memberId ? { ...member, plan, kind: "org" } : member,
  );
  persist();
}

export function removeOrgMember(memberId: string) {
  orgMembers = orgMembers.filter((member) => member.id !== memberId);
  policies = Object.fromEntries(
    Object.entries(policies).map(([workspaceId, policy]) => [
      workspaceId,
      {
        ...policy,
        members: policy.members.filter((row) => row.memberId !== memberId),
      },
    ]),
  );
  persist();
}

export function toggleMemberWorkspace(memberId: string, workspaceId: string) {
  const member = orgMembers.find((item) => item.id === memberId);
  if (!member) return;
  const assigned = member.workspaceIds.includes(workspaceId);
  const workspaceIds = assigned
    ? member.workspaceIds.filter((id) => id !== workspaceId)
    : [...member.workspaceIds, workspaceId];
  orgMembers = orgMembers.map((item) =>
    item.id === memberId ? { ...item, workspaceIds } : item,
  );

  const fallback = workspaceSpaces(workspaceId);
  const current = policies[workspaceId] ?? emptyPolicy();
  if (assigned) {
    policies = {
      ...policies,
      [workspaceId]: {
        ...current,
        members: current.members.filter((row) => row.memberId !== memberId),
      },
    };
  } else {
    const hasRow = current.members.some((row) => row.memberId === memberId);
    policies = {
      ...policies,
      [workspaceId]: {
        ...current,
        members: hasRow
          ? current.members
          : [...current.members, { memberId, spaces: fallback }],
      },
    };
  }
  persist();
}

export function toggleMemberSpace(
  workspaceId: string,
  memberId: string,
  spaceId: SpaceId,
) {
  const current = policyFor(workspaceId);
  const allowed = workspaceSpaces(workspaceId);
  if (!allowed.includes(spaceId)) return;
  policies = {
    ...policies,
    [workspaceId]: {
      ...current,
      members: current.members.map((row) => {
        if (row.memberId !== memberId) return row;
        const on = row.spaces.includes(spaceId);
        return {
          ...row,
          spaces: on
            ? row.spaces.filter((id) => id !== spaceId)
            : [...row.spaces, spaceId],
        };
      }),
    },
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
    files: [],
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

export function addKnowledgeFile(
  workspaceId: string,
  knowledgeId: string,
  upload: { name: string; size: string },
) {
  const current = policyFor(workspaceId);
  const nextFile: KnowledgeFile = {
    id: `file-${Date.now()}`,
    name: upload.name,
    size: upload.size,
    uploadedAt: "Just now",
  };
  policies = {
    ...policies,
    [workspaceId]: {
      ...current,
      knowledgeBases: current.knowledgeBases.map((item) =>
        item.id === knowledgeId
          ? {
              ...item,
              sources: item.files.length + 1,
              updatedAt: "Just now",
              files: [...item.files, nextFile],
            }
          : item,
      ),
    },
  };
  persist();
}

export function removeKnowledgeFile(
  workspaceId: string,
  knowledgeId: string,
  fileId: string,
) {
  const current = policyFor(workspaceId);
  policies = {
    ...policies,
    [workspaceId]: {
      ...current,
      knowledgeBases: current.knowledgeBases.map((item) => {
        if (item.id !== knowledgeId) return item;
        const files = item.files.filter((entry) => entry.id !== fileId);
        return {
          ...item,
          files,
          sources: files.length,
          updatedAt: "Just now",
        };
      }),
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

export function blockedConnectorIds(
  workspaceId: string,
  map: Record<string, WorkspacePolicy> | undefined,
  plan?: BillingPlan,
) {
  if (plan && !hasOrganizationControls(plan)) return [];
  return policyFor(workspaceId, map).disabledConnectors;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileSizeLabel(bytes: number) {
  return formatBytes(bytes);
}
