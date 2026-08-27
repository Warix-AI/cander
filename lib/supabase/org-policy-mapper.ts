import type {
  KnowledgeBase,
  KnowledgeFile,
  Member,
  Role,
  SeatStatus,
  SpaceId,
  WorkspaceMemberPolicy,
  WorkspacePolicy,
} from "@/lib/types";
import type { Pin, PinKind, PinTier } from "@/lib/types";
import type { SidebarLayout } from "@/lib/spaces";

export type OrgMemberRow = {
  id: string;
  org_id: string | null;
  profile_id: string | null;
  email: string;
  name: string;
  short_name: string;
  initials: string;
  role: Role;
  plan: Member["plan"];
  seat_status: SeatStatus;
  kind: Member["kind"];
  workspace_ids: string[];
  version: number;
};

export type WorkspacePolicyRow = {
  workspace_id: string;
  disabled_connectors: string[];
  version: number;
};

export type WorkspaceMemberSpaceRow = {
  workspace_id: string;
  member_id: string;
  spaces: string[];
};

export type KnowledgeBaseRow = {
  id: string;
  workspace_id: string;
  name: string;
  summary: string;
  sources_count: number;
  updated_label: string;
  version: number;
};

export type KnowledgeFileRow = {
  id: string;
  knowledge_base_id: string;
  workspace_id: string;
  name: string;
  size_label: string;
  uploaded_label: string;
};

export type UserPinRow = {
  id: string;
  profile_id: string;
  kind: PinKind;
  target_id: string;
  tier: PinTier;
  sort_order: number;
};

export type SidebarLayoutRow = {
  profile_id: string;
  main_nav: string[];
  more_nav: string[];
  layout_version: number;
};

export function memberToRow(member: Member): OrgMemberRow {
  const isInvite = member.id.startsWith("invite-");
  const isProfileId =
    !isInvite &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      member.id,
    );
  return {
    id: member.id,
    org_id: member.orgId ?? null,
    profile_id: isProfileId ? member.id : null,
    email: member.email,
    name: member.name,
    short_name: member.short,
    initials: member.initials,
    role: member.role,
    plan: member.plan,
    seat_status: member.seatStatus,
    kind: member.kind,
    workspace_ids: member.workspaceIds,
    version: 1,
  };
}

export function memberRowToMember(row: OrgMemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    short: row.short_name,
    initials: row.initials,
    role: row.role,
    plan: row.plan,
    seatStatus: row.seat_status,
    kind: row.kind,
    workspaceIds: row.workspace_ids ?? [],
    ...(row.org_id ? { orgId: row.org_id } : {}),
  };
}

export function knowledgeFileRowToFile(row: KnowledgeFileRow): KnowledgeFile {
  return {
    id: row.id,
    name: row.name,
    size: row.size_label,
    uploadedAt: row.uploaded_label,
  };
}

export function knowledgeFileToRow(
  file: KnowledgeFile,
  knowledgeBaseId: string,
  workspaceId: string,
): KnowledgeFileRow {
  return {
    id: file.id,
    knowledge_base_id: knowledgeBaseId,
    workspace_id: workspaceId,
    name: file.name,
    size_label: file.size,
    uploaded_label: file.uploadedAt,
  };
}

export function knowledgeBaseRowToBase(
  row: KnowledgeBaseRow,
  files: KnowledgeFile[],
): KnowledgeBase {
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    sources: row.sources_count,
    updatedAt: row.updated_label,
    files,
  };
}

export function knowledgeBaseToRow(
  kb: KnowledgeBase,
  workspaceId: string,
): KnowledgeBaseRow {
  return {
    id: kb.id,
    workspace_id: workspaceId,
    name: kb.name,
    summary: kb.summary,
    sources_count: kb.sources,
    updated_label: kb.updatedAt,
    version: 1,
  };
}

export function rebuildPoliciesFromRows(input: {
  policyRows: WorkspacePolicyRow[];
  memberSpaceRows: WorkspaceMemberSpaceRow[];
  knowledgeBaseRows: KnowledgeBaseRow[];
  knowledgeFileRows: KnowledgeFileRow[];
}): Record<string, WorkspacePolicy> {
  const policies: Record<string, WorkspacePolicy> = {};

  for (const row of input.policyRows) {
    policies[row.workspace_id] = {
      knowledgeBases: [],
      members: [],
      disabledConnectors: row.disabled_connectors ?? [],
    };
  }

  const filesByKb = new Map<string, KnowledgeFile[]>();
  for (const row of input.knowledgeFileRows) {
    const list = filesByKb.get(row.knowledge_base_id) ?? [];
    list.push(knowledgeFileRowToFile(row));
    filesByKb.set(row.knowledge_base_id, list);
  }

  for (const row of input.knowledgeBaseRows) {
    const policy = policies[row.workspace_id] ?? {
      knowledgeBases: [],
      members: [],
      disabledConnectors: [],
    };
    policy.knowledgeBases.push(
      knowledgeBaseRowToBase(row, filesByKb.get(row.id) ?? []),
    );
    policies[row.workspace_id] = policy;
  }

  for (const row of input.memberSpaceRows) {
    const policy = policies[row.workspace_id] ?? {
      knowledgeBases: [],
      members: [],
      disabledConnectors: [],
    };
    const spaces = (row.spaces ?? []) as SpaceId[];
    const members: WorkspaceMemberPolicy[] = policy.members.filter(
      (item) => item.memberId !== row.member_id,
    );
    members.push({ memberId: row.member_id, spaces });
    policies[row.workspace_id] = { ...policy, members };
  }

  return policies;
}

export function pinId(kind: PinKind, targetId: string) {
  return `pin-${kind}-${targetId}`;
}

export function pinToRow(
  pin: Pin,
  profileId: string,
  sortOrder: number,
): UserPinRow {
  const tier = pin.tier === "secondary" ? "secondary" : "primary";
  return {
    id: pinId(pin.kind, pin.id),
    profile_id: profileId,
    kind: pin.kind,
    target_id: pin.id,
    tier,
    sort_order: sortOrder,
  };
}

export function pinRowToPin(row: UserPinRow): Pin {
  return {
    kind: row.kind,
    id: row.target_id,
    tier: row.tier,
  };
}

export function sidebarToRow(
  layout: SidebarLayout,
  profileId: string,
  layoutVersion: number,
): SidebarLayoutRow {
  return {
    profile_id: profileId,
    main_nav: layout.main,
    more_nav: layout.more,
    layout_version: layoutVersion,
  };
}

export function sidebarRowToLayout(row: SidebarLayoutRow): SidebarLayout {
  return {
    main: row.main_nav as SidebarLayout["main"],
    more: row.more_nav as SidebarLayout["more"],
  };
}
