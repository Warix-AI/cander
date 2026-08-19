import { members as seedMembers, workspaces } from "./data";
import { ALL_SPACE_IDS } from "./spaces";
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

const file = (
  id: string,
  name: string,
  size: string,
  uploadedAt: string,
): KnowledgeFile => ({ id, name, size, uploadedAt });

const seedPolicies: Record<string, WorkspacePolicy> = {
  marketing: {
    knowledgeBases: [
      {
        id: "kb-brand",
        name: "Brand voice",
        summary: "Tone, claims we do not make, and Graphite language.",
        sources: 3,
        updatedAt: "2d ago",
        files: [
          file("f-brand-1", "graphite-voice.pdf", "240 KB", "2d ago"),
          file("f-brand-2", "claims-we-dont-make.md", "18 KB", "5d ago"),
          file("f-brand-3", "recursion-examples.txt", "9 KB", "1w ago"),
        ],
      },
      {
        id: "kb-product",
        name: "Product facts",
        summary: "Cander pricing, plans, and approved feature copy.",
        sources: 2,
        updatedAt: "5h ago",
        files: [
          file("f-prod-1", "cander-pricing.pdf", "410 KB", "5h ago"),
          file("f-prod-2", "feature-matrix.csv", "22 KB", "1d ago"),
        ],
      },
      {
        id: "kb-campaigns",
        name: "Campaign archive",
        summary: "Past launches, stills, and cutdowns for reuse.",
        sources: 4,
        updatedAt: "Yesterday",
        files: [
          file("f-camp-1", "spring-launch.zip", "12.4 MB", "Yesterday"),
          file("f-camp-2", "hero-stills.pdf", "8.1 MB", "3d ago"),
          file("f-camp-3", "cutdown-notes.md", "6 KB", "4d ago"),
          file("f-camp-4", "press-kit.pdf", "2.2 MB", "1w ago"),
        ],
      },
    ],
    members: [
      { memberId: "m1", spaces: ALL_SPACES },
      { memberId: "m2", spaces: ALL_SPACES },
      { memberId: "m4", spaces: ["work", "studio", "research", "personal", "connectors"] },
      { memberId: "m6", spaces: ALL_SPACES },
    ],
    disabledConnectors: ["github", "jira", "linear"],
  },
  engineering: {
    knowledgeBases: [
      {
        id: "kb-arch",
        name: "Architecture",
        summary: "Runtime topology, hosting, and service boundaries.",
        sources: 3,
        updatedAt: "1d ago",
        files: [
          file("f-arch-1", "runtime-topology.pdf", "1.1 MB", "1d ago"),
          file("f-arch-2", "hosting.md", "14 KB", "2d ago"),
          file("f-arch-3", "service-map.json", "8 KB", "1w ago"),
        ],
      },
      {
        id: "kb-runbooks",
        name: "Runbooks",
        summary: "On-call steps, local runtime, and incident notes.",
        sources: 2,
        updatedAt: "3d ago",
        files: [
          file("f-run-1", "on-call.md", "21 KB", "3d ago"),
          file("f-run-2", "local-runtime.md", "12 KB", "1w ago"),
        ],
      },
    ],
    members: [
      {
        memberId: "m1",
        spaces: ["work", "build", "research", "personal", "connectors"],
      },
      {
        memberId: "m2",
        spaces: ["work", "build", "research", "personal", "connectors"],
      },
      {
        memberId: "m3",
        spaces: ["work", "build", "research", "personal", "connectors"],
      },
      {
        memberId: "m5",
        spaces: ["work", "build", "research", "personal", "connectors"],
      },
    ],
    disabledConnectors: ["hubspot", "gmail"],
  },
  operations: {
    knowledgeBases: [
      {
        id: "kb-vendors",
        name: "Vendor policy",
        summary: "Who we may connect, retention, and review cadence.",
        sources: 2,
        updatedAt: "1w ago",
        files: [
          file("f-vend-1", "vendor-policy.pdf", "380 KB", "1w ago"),
          file("f-vend-2", "retention.md", "11 KB", "2w ago"),
        ],
      },
    ],
    members: [
      { memberId: "m1", spaces: ["work", "research", "personal", "connectors"] },
      { memberId: "m2", spaces: ["work", "research", "personal", "connectors"] },
      { memberId: "m5", spaces: ["work", "research", "personal", "connectors"] },
      { memberId: "m6", spaces: ["work", "research", "connectors"] },
    ],
    disabledConnectors: ["figma", "discord"],
  },
};

const listeners = new Set<Listener>();
let policies: Record<string, WorkspacePolicy> = structuredClone(seedPolicies);
let orgMembers: Member[] = structuredClone(seedMembers);

function emit() {
  listeners.forEach((listener) => listener());
}

function persist() {
  window.localStorage.setItem(
    "courier-workspace-policies",
    JSON.stringify(policies),
  );
  window.localStorage.setItem("courier-org-members", JSON.stringify(orgMembers));
  emit();
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
  ensure("work");
  ensure("personal");
  if (
    (fallback.includes("personal") ||
      fallback.includes("finances") ||
      fallback.includes("health")) &&
    !next.includes("personal")
  ) {
    next.push("personal");
  }
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
  const next = structuredClone(seedPolicies);
  if (!raw || typeof raw !== "object") return next;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const policy = value as Partial<WorkspacePolicy>;
    const fallback =
      workspaces.find((item) => item.id === id)?.spaces ?? ALL_SPACES;
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
  const seed = structuredClone(seedMembers);
  if (!Array.isArray(raw)) return seed;
  const stored = new Map<string, Partial<Member>>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<Member>;
    if (!row.id) continue;
    stored.set(String(row.id), row);
  }
  return seed.map((base) => {
    const row = stored.get(base.id);
    if (!row) return base;
    const role: Role =
      row.role === "Owner" || row.role === "Admin" || row.role === "Member"
        ? row.role
        : base.role;
    const storedPlan = String(row.plan ?? "");
    const plan: BillingPlan =
      storedPlan === "plus"
        ? "pro"
        : storedPlan === "free" ||
            storedPlan === "pro" ||
            storedPlan === "max" ||
            storedPlan === "ultra"
          ? (storedPlan as BillingPlan)
          : base.plan;
    const seatStatus: SeatStatus =
      row.seatStatus === "active" || row.seatStatus === "pending"
        ? row.seatStatus
        : base.seatStatus;
    return {
      ...base,
      role,
      plan,
      seatStatus,
      workspaceIds: Array.isArray(row.workspaceIds)
        ? row.workspaceIds.map(String)
        : base.workspaceIds,
    };
  });
}

export function subscribePolicies(listener: Listener) {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("courier-workspace-policies");
    if (stored) {
      try {
        policies = hydrate(JSON.parse(stored));
        persist();
      } catch {
        policies = structuredClone(seedPolicies);
      }
    }
    const version = window.localStorage.getItem("courier-org-members-v");
    const storedMembers = window.localStorage.getItem("courier-org-members");
    if (version !== "3") {
      orgMembers = structuredClone(seedMembers);
      window.localStorage.setItem("courier-org-members-v", "3");
      persist();
    } else if (storedMembers) {
      try {
        orgMembers = hydrateMembers(JSON.parse(storedMembers));
      } catch {
        orgMembers = structuredClone(seedMembers);
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

export function getMembersSnapshot() {
  return orgMembers;
}

export function getMembersServerSnapshot() {
  return seedMembers;
}

function workspaceSpaces(workspaceId: string): SpaceId[] {
  return workspaces.find((item) => item.id === workspaceId)?.spaces ?? ALL_SPACES;
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
  if (!policies[workspaceId]) {
    const admin = adminId
      ? [{ memberId: adminId, spaces: [...spaces] }]
      : [];
    policies = {
      ...policies,
      [workspaceId]: { ...emptyPolicy(), members: admin },
    };
  }
  if (adminId) {
    orgMembers = orgMembers.map((member) =>
      member.id === adminId && !member.workspaceIds.includes(workspaceId)
        ? { ...member, workspaceIds: [...member.workspaceIds, workspaceId] }
        : member,
    );
  }
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
    const workspaceIds = member.workspaceIds.filter(
      (id) => !id.startsWith("solo-"),
    );
    return {
      ...member,
      plan: "max" as const,
      seatStatus: "active" as const,
      role: member.role === "Owner" ? "Owner" : "Member",
      workspaceIds: workspaceIds.length ? workspaceIds : ["marketing"],
    };
  });
  persist();
}

export function setMemberSeat(memberId: string, plan: BillingPlan) {
  orgMembers = orgMembers.map((member) => {
    if (member.id !== memberId) return member;
    if (plan === "max" || plan === "ultra") {
      const workspaceIds = member.workspaceIds.filter(
        (id) => !id.startsWith("solo-"),
      );
      return {
        ...member,
        plan,
        seatStatus: "active",
        workspaceIds: workspaceIds.length ? workspaceIds : ["marketing"],
      };
    }
    const solo =
      plan === "pro"
        ? member.id === "p-ultra"
          ? "solo-ultra"
          : "solo-pro"
        : "solo-free";
    return {
      ...member,
      plan,
      seatStatus: member.kind === "org" ? "pending" : "active",
      workspaceIds: [solo],
    };
  });
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
  if (plan && plan !== "max" && plan !== "ultra") return [];
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
