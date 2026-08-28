export type WorkScope = "today" | "apps" | "automations";

export type WorkTone = "urgent" | "waiting" | "ready" | "neutral";

export type WorkItem = {
  id: string;
  workspaceId: string;
  /** Scopes this item appears in (today is the briefing surface). */
  lanes: WorkScope[];
  title: string;
  summary: string;
  meta: string;
  badge?: string;
  tone?: WorkTone;
  prompt: string;
  /** When set, only show if this connector is attached to Work. */
  connectorId?: string;
};

export function workScopeOptions(): { id: WorkScope; label: string }[] {
  return [
    { id: "today", label: "Today" },
    { id: "apps", label: "Apps" },
    { id: "automations", label: "Automations" },
  ];
}

export function workItemsFor(
  workspaceId: string,
  scope: WorkScope,
  attachedConnectorIds: string[] = [],
): WorkItem[] {
  return attachedConnectorIds.flatMap((id) =>
    generatedItemsFor(workspaceId, id, scope),
  );
}

/** Lightweight rows created when a connector is attached to Work. */
function generatedItemsFor(
  workspaceId: string,
  connectorId: string,
  scope: WorkScope,
): WorkItem[] {
  const templates = connectorWorkTemplates[connectorId];
  if (!templates) return [];
  return templates
    .filter((item) => item.lanes.includes(scope))
    .map((item) => ({
      lanes: item.lanes,
      title: item.title,
      summary: item.summary,
      meta: item.meta,
      badge: item.badge,
      tone: item.tone,
      prompt: item.prompt,
      id: `gen-${connectorId}-${item.key}`,
      workspaceId,
      connectorId,
    }));
}

type WorkItemTemplate = Omit<WorkItem, "id" | "workspaceId" | "connectorId"> & {
  key: string;
};

const connectorWorkTemplates: Record<string, WorkItemTemplate[]> = {
  notion: [
    {
      key: "shared",
      lanes: ["today"],
      title: "Notion — pages shared with you",
      summary: "Two docs need a review before the launch sync.",
      meta: "Notion · just now",
      badge: "New",
      tone: "ready",
      prompt: "What’s new in Notion that needs my review for Work?",
    },
  ],
  linear: [
    {
      key: "issues",
      lanes: ["today"],
      title: "Linear — assigned issues",
      summary: "Three issues tagged to you this morning.",
      meta: "Linear · just now",
      badge: "Issues",
      tone: "urgent",
      prompt: "Brief my Linear issues assigned to me for Work today.",
    },
  ],
  figma: [
    {
      key: "comments",
      lanes: ["today"],
      title: "Figma — comments waiting",
      summary: "Design left two comments on the hero frame.",
      meta: "Figma · just now",
      badge: "Comments",
      tone: "waiting",
      prompt: "Summarize open Figma comments that need my reply.",
    },
  ],
  gdrive: [
    {
      key: "shared",
      lanes: ["today"],
      title: "Drive — shared with me",
      summary: "A proposal draft landed in Shared drives.",
      meta: "Drive · just now",
      badge: "File",
      tone: "ready",
      prompt: "What’s new in Google Drive for Work that I should open?",
    },
  ],
};

export function workSectionTitle(scope: WorkScope) {
  if (scope === "today") return "Your day";
  if (scope === "apps") return "Apps in Work";
  return "Automations";
}

export function workEmptyCopy(scope: WorkScope) {
  if (scope === "today") {
    return "No work today. Start a project or ask Cander when you're ready.";
  }
  if (scope === "apps") {
    return "No apps in Work yet. Features coming soon.";
  }
  return "No automations running yet. Create a project to get started.";
}

export function workAppsFor(
  workspaceId: string,
  attachedConnectorIds: string[],
  attachedBuildIds: string[],
  connectorNames: Record<string, string>,
  buildNames: Record<string, string>,
): WorkItem[] {
  const items: WorkItem[] = [];
  for (const id of attachedConnectorIds) {
    items.push({
      id: `app-connector-${id}`,
      workspaceId,
      lanes: ["apps"],
      title: connectorNames[id] ?? id,
      summary: "Connected app available in Work.",
      meta: "Connector · attached",
      badge: "App",
      tone: "ready",
      prompt: `What should I do in ${connectorNames[id] ?? id} for Work today?`,
      connectorId: id,
    });
  }
  for (const id of attachedBuildIds) {
    items.push({
      id: `app-build-${id}`,
      workspaceId,
      lanes: ["apps"],
      title: buildNames[id] ?? id,
      summary: "Built in Build and added to Work.",
      meta: "Build · in Work",
      badge: "App",
      tone: "neutral",
      prompt: `Open and help me use ${buildNames[id] ?? id} in Work.`,
    });
  }
  return items;
}

export const workBriefActions = [
  {
    id: "brief-inbox",
    label: "Needs a reply",
    prompt: "Brief my inbox — what needs a reply today?",
  },
  {
    id: "prep-meeting",
    label: "Meetings today",
    prompt: "Prep me for my meetings today — agenda, open questions, and last notes.",
  },
  {
    id: "chase-followups",
    label: "Follow-ups",
    prompt: "What follow-ups are overdue or due today? Draft nudges where helpful.",
  },
  {
    id: "approvals",
    label: "Approvals",
    prompt: "What approvals are waiting on me? Summarize risk and draft a decision note.",
  },
] as const;

export const workItems: WorkItem[] = [
  {
    id: "w-northwind-reply",
    workspaceId: "marketing",
    lanes: ["today"],
    title: "Northwind — pricing note",
    summary: "They asked for seat vs usage clarity before tomorrow’s call.",
    meta: "Email · 42m ago",
    badge: "Reply",
    tone: "urgent",
    prompt: "Draft a reply to Northwind’s pricing note — keep it clear on seat vs usage.",
    connectorId: "gmail",
  },
  {
    id: "w-slack-threads",
    workspaceId: "marketing",
    lanes: ["today"],
    title: "Two Slack threads waiting",
    summary: "#launch and #design need your take on the hero cut.",
    meta: "Slack · 1h ago",
    badge: "Reply",
    tone: "urgent",
    prompt: "Summarize the two Slack threads waiting on me and draft short replies.",
    connectorId: "slack",
  },
  {
    id: "w-launch-sync",
    workspaceId: "marketing",
    lanes: ["today"],
    title: "2:00 PM — Launch sync",
    summary: "Open questions from last week and the Cander publish checklist.",
    meta: "In 3h · Zoom",
    badge: "Prep",
    tone: "ready",
    prompt: "Prep me for the 2 PM launch sync — open questions and last week’s notes.",
    connectorId: "gcal",
  },
  {
    id: "w-acme-call",
    workspaceId: "marketing",
    lanes: ["today"],
    title: "Thu — Acme renewal call",
    summary: "Proposal still draft; they want numbers before Friday.",
    meta: "Thu 10:30 · Google Meet",
    badge: "Meeting",
    tone: "ready",
    prompt: "Prep the Acme renewal call — proposal status, risks, and talking points.",
    connectorId: "gcal",
  },
  {
    id: "w-acme-renewal",
    workspaceId: "marketing",
    lanes: ["today"],
    title: "Acme renewal",
    summary: "Customer needs a proposal before Friday. Owner: you.",
    meta: "Due Fri",
    badge: "Account",
    tone: "urgent",
    prompt: "Help me finish the Acme renewal proposal before Friday.",
  },
  {
    id: "w-vendor-invoice",
    workspaceId: "marketing",
    lanes: ["today"],
    title: "Vendor invoice — Figma",
    summary: "You asked finance for a PO; no reply since Monday.",
    meta: "Waiting 3d",
    badge: "Waiting",
    tone: "waiting",
    prompt: "Draft a polite nudge to finance about the Figma PO I requested Monday.",
    connectorId: "gmail",
  },
  {
    id: "w-design-feedback",
    workspaceId: "marketing",
    lanes: ["today"],
    title: "Design feedback on hero",
    summary: "You promised Maya a decision by EOD.",
    meta: "Due today",
    badge: "Promise",
    tone: "urgent",
    prompt: "Remind me what I promised Maya on the hero and help me decide.",
    connectorId: "slack",
  },
  {
    id: "w-partner-deck",
    workspaceId: "marketing",
    lanes: ["today"],
    title: "Partner deck from Recursion",
    summary: "Sent Monday — no open yet. Soft follow-up ready.",
    meta: "Sent 2d ago",
    badge: "Outbound",
    tone: "waiting",
    prompt: "Draft a short follow-up on the partner deck I sent Monday.",
    connectorId: "gmail",
  },
  {
    id: "w-expense-travel",
    workspaceId: "marketing",
    lanes: ["today"],
    title: "Travel expense — Austin offsite",
    summary: "Jordan submitted $428 · flights + rideshare.",
    meta: "Needs you",
    badge: "Expense",
    tone: "ready",
    prompt: "Review Jordan’s Austin offsite expense ($428) and tell me if I should approve.",
  },
  {
    id: "w-access-figma",
    workspaceId: "marketing",
    lanes: ["today"],
    title: "Figma access — contractor",
    summary: "Priya requested Editor on the Cander file for two weeks.",
    meta: "Queued",
    badge: "Access",
    tone: "ready",
    prompt: "Should I approve Priya’s contractor Figma Editor access for two weeks?",
  },
  {
    id: "w-time-off",
    workspaceId: "marketing",
    lanes: ["today"],
    title: "Time off — Sam · Thu–Fri",
    summary: "Coverage noted for launch Slack; no calendar conflicts.",
    meta: "Pending",
    badge: "PTO",
    tone: "neutral",
    prompt: "Review Sam’s Thu–Fri time-off request and draft an approve note.",
  },
  {
    id: "w-eng-standup",
    workspaceId: "engineering",
    lanes: ["today"],
    title: "Engineering standup",
    summary: "Overnight deploy blockers and on-call handoff.",
    meta: "In 25m",
    badge: "Prep",
    tone: "ready",
    prompt: "Prep me for engineering standup — blockers and on-call handoff.",
    connectorId: "gcal",
  },
  {
    id: "w-eng-pr",
    workspaceId: "engineering",
    lanes: ["today"],
    title: "PR review — preview chrome",
    summary: "Alex asked for a look before merge.",
    meta: "GitHub · 1h ago",
    badge: "Review",
    tone: "urgent",
    prompt: "Help me review Alex’s preview chrome PR — summarize risk and what to check.",
    connectorId: "github",
  },
  {
    id: "w-ops-vendors",
    workspaceId: "operations",
    lanes: ["today"],
    title: "Vendor follow-ups",
    summary: "Three invoices and a contract sitting in email.",
    meta: "Email · 4h ago",
    badge: "Reply",
    tone: "urgent",
    prompt: "Help me clear the vendor follow-ups — invoices and the open contract.",
    connectorId: "gmail",
  },
  {
    id: "w-ops-po",
    workspaceId: "operations",
    lanes: ["today"],
    title: "PO approval — warehouse sensors",
    summary: "$12.4k · under budget, needs Ops lead sign-off.",
    meta: "Needs you",
    badge: "PO",
    tone: "ready",
    prompt: "Review the warehouse sensors PO for $12.4k and recommend approve or hold.",
    connectorId: "stripe",
  },
];
