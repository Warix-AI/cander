export type WorkTodayAction = "Reply" | "Review" | "Continue" | "Open";

export type WorkTodayItem = {
  id: string;
  title: string;
  source: string;
  action: WorkTodayAction;
};

/** Work collection filters — projects grouped by product space. */
export type WorkCollectionCategory = "home" | "build" | "studio";

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
  /** Live preview / first-site cover for aggregated cards. */
  cover?: string;
  /** Explore-style paper frame vs Build full-bleed preview. */
  previewKind?: "paper" | "product";
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
    source: "Create",
    action: "Continue",
  },
  {
    id: "focus-4",
    title: "Approve design system updates",
    source: "Create",
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
    source: "Create",
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
    id: "col-build-1",
    title: "Team standup board",
    summary: "Daily standup and blockers",
    source: "Create",
    category: "build",
    addedAt: "2026-08-28T14:00:00Z",
    cover: "/previews/portal.png",
    previewKind: "product",
  },
  {
    id: "col-build-2",
    title: "Expense tracker",
    summary: "Receipts and reimbursements",
    source: "Create",
    category: "build",
    addedAt: "2026-08-20T09:30:00Z",
    cover: "/previews/crm.png",
    previewKind: "product",
  },
  {
    id: "col-build-3",
    title: "Client portal v2",
    summary: "Auth, billing, and account settings",
    source: "Create",
    category: "build",
    addedAt: "2026-08-25T16:45:00Z",
    cover: "/previews/console.png",
    previewKind: "product",
  },
  {
    id: "col-home-1",
    title: "Market research — AI tools",
    summary: "Competitive landscape and pricing",
    source: "Explore",
    category: "home",
    addedAt: "2026-08-22T11:15:00Z",
    cover: "/previews/docs.png",
    previewKind: "paper",
  },
  {
    id: "col-home-2",
    title: "Q3 planning doc",
    summary: "Goals, milestones, and owners",
    source: "Explore",
    category: "home",
    addedAt: "2026-08-15T13:20:00Z",
    cover: "/previews/docs.png",
    previewKind: "paper",
  },
  {
    id: "col-studio-1",
    title: "Brand guidelines",
    summary: "Logo, color, and typography rules",
    source: "Create",
    category: "studio",
    addedAt: "2026-08-18T08:00:00Z",
    cover: "/previews/studio-campaign.png",
    previewKind: "product",
  },
  {
    id: "col-studio-2",
    title: "Design system updates",
    summary: "Component and token refresh",
    source: "Create",
    category: "studio",
    addedAt: "2026-08-16T12:00:00Z",
    cover: "/previews/portal.png",
    previewKind: "product",
  },
];

export const WORK_COLLECTION_CATEGORY_OPTIONS: {
  id: WorkCollectionCategory;
  label: string;
}[] = [
  { id: "home", label: "Explore" },
  { id: "build", label: "Create" },
  { id: "studio", label: "Images" },
];

export function workCollectionCategoryLabel(
  category: WorkCollectionCategory,
): string {
  switch (category) {
    case "home":
      return "Explore";
    case "build":
      return "Create";
    case "studio":
      return "Images";
  }
}
