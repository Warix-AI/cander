export type WorkTodayAction = "Reply" | "Review" | "Continue" | "Open";

export type WorkTodayItem = {
  id: string;
  title: string;
  source: string;
  action: WorkTodayAction;
};

export type WorkCollectionCategory =
  | "apps"
  | "projects"
  | "assets"
  | "connections";

export type WorkCollectionItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  category: WorkCollectionCategory;
  addedAt: string;
  connectorId?: string;
  /** When set, the pinned tab loads the built project's preview. */
  linkedProjectId?: string;
};

export const WORK_FOCUS_NOW: WorkTodayItem[] = [
  {
    id: "focus-1",
    title: "Reply to Acme contract redlines",
    source: "Gmail",
    action: "Reply",
  },
  {
    id: "focus-2",
    title: "Review Q3 roadmap draft",
    source: "Explore",
    action: "Review",
  },
  {
    id: "focus-3",
    title: "Continue client portal fixes",
    source: "Build",
    action: "Continue",
  },
  {
    id: "focus-4",
    title: "Approve design system updates",
    source: "Studio",
    action: "Review",
  },
];

export const WORK_ON_DECK: WorkTodayItem[] = [
  {
    id: "deck-1",
    title: "Sync calendar for Thursday off-site",
    source: "Google Calendar",
    action: "Open",
  },
  {
    id: "deck-2",
    title: "Check deployment status for staging",
    source: "Build",
    action: "Open",
  },
  {
    id: "deck-3",
    title: "Summarize competitor research notes",
    source: "Explore",
    action: "Open",
  },
];

export const WORK_COLLECTION_ITEMS: WorkCollectionItem[] = [
  {
    id: "col-app-1",
    title: "Team standup board",
    summary: "Daily standup and blockers",
    source: "Build",
    category: "apps",
    addedAt: "2026-08-28T14:00:00Z",
  },
  {
    id: "col-app-2",
    title: "Expense tracker",
    summary: "Receipts and reimbursements",
    source: "Build",
    category: "apps",
    addedAt: "2026-08-20T09:30:00Z",
  },
  {
    id: "col-proj-1",
    title: "Client portal v2",
    summary: "Auth, billing, and account settings",
    source: "Build",
    category: "projects",
    addedAt: "2026-08-25T16:45:00Z",
  },
  {
    id: "col-proj-2",
    title: "Market research — AI tools",
    summary: "Competitive landscape and pricing",
    source: "Explore",
    category: "projects",
    addedAt: "2026-08-22T11:15:00Z",
  },
  {
    id: "col-asset-1",
    title: "Brand guidelines",
    summary: "Logo, color, and typography rules",
    source: "Assets",
    category: "assets",
    addedAt: "2026-08-18T08:00:00Z",
  },
  {
    id: "col-asset-2",
    title: "Q3 planning doc",
    summary: "Goals, milestones, and owners",
    source: "Explore",
    category: "assets",
    addedAt: "2026-08-15T13:20:00Z",
  },
  {
    id: "col-conn-1",
    title: "Gmail",
    summary: "Inbox and threads in Work",
    source: "Connections",
    category: "connections",
    addedAt: "2026-08-10T10:00:00Z",
    connectorId: "gmail",
  },
  {
    id: "col-conn-2",
    title: "Slack",
    summary: "Channels and mentions",
    source: "Connections",
    category: "connections",
    addedAt: "2026-08-10T10:05:00Z",
    connectorId: "slack",
  },
  {
    id: "col-conn-3",
    title: "Google Calendar",
    summary: "Meetings and availability",
    source: "Connections",
    category: "connections",
    addedAt: "2026-08-12T09:00:00Z",
    connectorId: "gcal",
  },
];

export const WORK_COLLECTION_CATEGORY_OPTIONS: {
  id: "all" | WorkCollectionCategory;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "apps", label: "Apps" },
  { id: "projects", label: "Projects" },
  { id: "assets", label: "Assets" },
  { id: "connections", label: "Connections" },
];

export function workCollectionCategoryLabel(
  category: WorkCollectionCategory,
): string {
  switch (category) {
    case "apps":
      return "App";
    case "projects":
      return "Project";
    case "assets":
      return "Asset";
    case "connections":
      return "Connection";
  }
}
