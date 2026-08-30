export type WorkScope = "today" | "apps" | "automations" | "connectors";

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
    { id: "connectors", label: "Connectors" },
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

/**
 * Connector-attached Work rows come from real briefing sync only.
 * Do not generate sample “just now” activity locally.
 */
function generatedItemsFor(
  _workspaceId: string,
  _connectorId: string,
  _scope: WorkScope,
): WorkItem[] {
  return [];
}

export function workSectionTitle(scope: WorkScope) {
  if (scope === "today") return "Your day";
  if (scope === "apps") return "Apps in Work";
  if (scope === "automations") return "Automations";
  return "Connectors";
}

export function workEmptyCopy(scope: WorkScope) {
  if (scope === "today") {
    return "No tasks or alerts yet. Ask Cander when you're ready to plan the day.";
  }
  if (scope === "apps") {
    return "No apps in Work yet. Publish from Build and add them here.";
  }
  if (scope === "automations") {
    return "No automations running yet. Create one in Build to get started.";
  }
  return "No connectors in Work yet. Connect Gmail, Slack, Calendar, or Drive.";
}

/** Featured connectors shown in Work when none are attached yet. */
export const WORK_FEATURED_CONNECTOR_IDS = [
  "gmail",
  "slack",
  "gcal",
  "gdrive",
] as const;

export function workAppsFor(
  workspaceId: string,
  attachedBuildIds: string[],
  buildNames: Record<string, string>,
): WorkItem[] {
  const items: WorkItem[] = [];
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

/** Production Work/Recents never use static sample rows. */
export const workItems: WorkItem[] = [];
