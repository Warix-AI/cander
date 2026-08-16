import type {
  Connector,
  Member,
  PlatformNav,
  Project,
  ScheduledJob,
  Skill,
  SpaceId,
  Thread,
  Workspace,
} from "./types";

export const account = {
  id: "acme",
  name: "Acme Inc.",
  seats: 42,
};

export const currentUser = {
  id: "m1",
  name: "Matthew Gross",
  short: "Matthew",
  initials: "MG",
  email: "matthew@acme.com",
};

export const platformNavItems: { id: PlatformNav; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "hosting", label: "Hosting" },
  { id: "models", label: "Models" },
  { id: "api", label: "APIs" },
  { id: "keys", label: "Keys" },
  { id: "deployments", label: "Deployments" },
  { id: "logs", label: "Logs" },
  { id: "usage", label: "Usage" },
  { id: "docs", label: "Docs" },
];

export const currentUserId = currentUser.id;

export const spaces: { id: SpaceId; label: string }[] = [
  { id: "build", label: "Build" },
  { id: "studio", label: "Studio" },
  { id: "research", label: "Research" },
  { id: "skills", label: "Skills" },
  { id: "connectors", label: "Connectors" },
  { id: "scheduled", label: "Scheduled" },
];

export const workspaces: Workspace[] = [
  {
    id: "marketing",
    name: "Marketing",
    spaces: ["build", "studio", "research", "skills", "scheduled", "connectors"],
    members: 12,
    budget: "$4,200",
    spend: "$2,640",
  },
  {
    id: "engineering",
    name: "Engineering",
    spaces: ["build", "research", "skills", "scheduled", "connectors"],
    members: 18,
    budget: "$6,800",
    spend: "$4,110",
  },
  {
    id: "operations",
    name: "Operations",
    spaces: ["research", "skills", "scheduled", "connectors"],
    members: 8,
    budget: "$1,400",
    spend: "$890",
  },
];

export const members: Member[] = [
  {
    id: "m1",
    name: "Matthew Gross",
    email: "matthew@acme.com",
    role: "Admin",
    workspaceIds: ["marketing", "engineering", "operations"],
  },
  {
    id: "m2",
    name: "Jackson Oaks",
    email: "jackson@acme.com",
    role: "Owner",
    workspaceIds: ["marketing", "engineering", "operations"],
  },
  {
    id: "m3",
    name: "Ryker Ross",
    email: "ryker@acme.com",
    role: "Admin",
    workspaceIds: ["engineering"],
  },
  {
    id: "m4",
    name: "Ava Chen",
    email: "ava@acme.com",
    role: "Member",
    workspaceIds: ["marketing"],
  },
  {
    id: "m5",
    name: "Noah Patel",
    email: "noah@acme.com",
    role: "Member",
    workspaceIds: ["engineering", "operations"],
  },
  {
    id: "m6",
    name: "Sofia Alvarez",
    email: "sofia@acme.com",
    role: "Member",
    workspaceIds: ["marketing", "operations"],
  },
];

export const projects: Project[] = [
  {
    id: "cander",
    name: "Cander",
    space: "build",
    workspaceId: "marketing",
    summary: "Public marketing site and pricing for Cander.",
    updatedAt: "2h ago",
  },
  {
    id: "starbase",
    name: "Starbase",
    space: "build",
    workspaceId: "engineering",
    summary: "Internal operator console for fleet telemetry.",
    updatedAt: "Yesterday",
  },
  {
    id: "client-portal",
    name: "Client Portal",
    space: "build",
    workspaceId: "marketing",
    summary: "Customer-facing portal for proposals and files.",
    updatedAt: "3d ago",
  },
  {
    id: "product-campaign",
    name: "Product Campaign",
    space: "studio",
    workspaceId: "marketing",
    summary: "Still photography and seasonal cutdowns.",
    updatedAt: "4h ago",
  },
  {
    id: "demo-videos",
    name: "Demo Videos",
    space: "studio",
    workspaceId: "marketing",
    summary: "Cander product walkthroughs and launch clips.",
    updatedAt: "1d ago",
  },
  {
    id: "competitor-research",
    name: "Competitor Research",
    space: "research",
    workspaceId: "marketing",
    summary: "Pricing, positioning, and launch cadence.",
    updatedAt: "5h ago",
  },
  {
    id: "ai-infrastructure",
    name: "AI Infrastructure",
    space: "research",
    workspaceId: "engineering",
    summary: "Local vs managed inference, tool-calling notes.",
    updatedAt: "2d ago",
  },
];

export const scheduledJobs: ScheduledJob[] = [
  {
    id: "job-weekly-cander",
    name: "Cander landing hero",
    workspaceId: "marketing",
    space: "build",
    projectId: "cander",
    threadId: "t-cander-hero",
    snippet: "Tighten the hero and ship a preview every Monday.",
    schedule: "Every Monday 09:00",
    nextRun: "Mon, Aug 17",
    lastRun: "Mon, Aug 10",
    status: "upcoming",
    owner: "Ava Chen",
  },
  {
    id: "job-daily-competitors",
    name: "OpenAI pricing notes",
    workspaceId: "marketing",
    space: "research",
    projectId: "competitor-research",
    threadId: "t-pricing",
    snippet: "Refresh competitor pricing and attach new sources.",
    schedule: "Every day 07:30",
    nextRun: "Tomorrow 07:30",
    lastRun: "Today 07:30",
    status: "active",
    owner: "Sofia Alvarez",
  },
  {
    id: "job-monthly-usage",
    name: "Workspace usage brief",
    workspaceId: "operations",
    space: "research",
    snippet: "Summarize seat and Platform spend for the workspace.",
    schedule: "1st of each month",
    nextRun: "Sep 1",
    lastRun: "Aug 1",
    status: "paused",
    owner: "Noah Patel",
  },
];

export const connectors: Connector[] = [
  {
    id: "gmail",
    name: "Gmail",
    category: "Mail",
    icon: "gmail",
    installed: true,
    accounts: [
      { id: "g1", label: "matthew@acme.com", status: "connected" },
      { id: "g2", label: "support@acme.com", status: "connected" },
      { id: "g3", label: "sales@acme.com", status: "needs-reauth" },
    ],
    actions: ["Send", "Draft", "Search", "Label"],
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "Payments",
    icon: "stripe",
    installed: true,
    accounts: [{ id: "s1", label: "Acme Inc. live", status: "connected" }],
    actions: ["Customers", "Invoices", "Subscriptions", "Balance"],
  },
  {
    id: "github",
    name: "GitHub",
    category: "Code",
    icon: "github",
    installed: true,
    accounts: [{ id: "gh1", label: "acme-inc", status: "connected" }],
    actions: ["Repos", "PRs", "Issues", "Actions"],
  },
  {
    id: "gcal",
    name: "Google Calendar",
    category: "Calendar",
    icon: "googlecalendar",
    installed: true,
    accounts: [{ id: "c1", label: "team@acme.com", status: "connected" }],
    actions: ["List events", "Create", "Update"],
  },
  {
    id: "slack",
    name: "Slack",
    category: "Chat",
    icon: "slack",
    installed: true,
    accounts: [{ id: "sl1", label: "Acme", status: "connected" }],
    actions: ["Post", "Search", "Channels"],
  },
  {
    id: "notion",
    name: "Notion",
    category: "Docs",
    icon: "notion",
    installed: false,
    accounts: [],
    actions: ["Pages", "Search", "Database"],
  },
  {
    id: "figma",
    name: "Figma",
    category: "Design",
    icon: "figma",
    installed: false,
    accounts: [],
    actions: ["Files", "Comments", "Export"],
  },
  {
    id: "linear",
    name: "Linear",
    category: "Issues",
    icon: "linear",
    installed: false,
    accounts: [],
    actions: ["Issues", "Projects", "Comments"],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "CRM",
    icon: "hubspot",
    installed: false,
    accounts: [],
    actions: ["Contacts", "Deals", "Notes"],
  },
  {
    id: "discord",
    name: "Discord",
    category: "Chat",
    icon: "discord",
    installed: false,
    accounts: [],
    actions: ["Channels", "Post", "Search"],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    category: "Files",
    icon: "dropbox",
    installed: false,
    accounts: [],
    actions: ["List", "Upload", "Share"],
  },
  {
    id: "jira",
    name: "Jira",
    category: "Issues",
    icon: "jira",
    installed: false,
    accounts: [],
    actions: ["Issues", "Boards", "Sprint"],
  },
];

export const skills: Skill[] = [
  {
    id: "sk-brand",
    name: "Recursion voice",
    summary: "Keep replies Graphite: short, left-aligned, no hype.",
    when: "Any customer-facing copy",
    workspaceId: "marketing",
    source: "custom",
    updatedAt: "2d ago",
  },
  {
    id: "sk-preview",
    name: "Always attach preview",
    summary: "When building a page, open Preview after the first reply.",
    when: "Build chats",
    workspaceId: "marketing",
    source: "ai",
    updatedAt: "5h ago",
  },
  {
    id: "sk-cite",
    name: "Cite sources",
    summary: "Name the URL next to every claim in Research.",
    when: "Research chats",
    workspaceId: "marketing",
    source: "custom",
    updatedAt: "1w ago",
  },
];

export const starterThreads: Thread[] = [
  {
    id: "t-cander-hero",
    title: "Cander landing hero",
    workspaceId: "marketing",
    projectId: "cander",
    spaceId: "build",
    updatedAt: "2h ago",
    snippet: "Tighten the hero and ship a preview.",
    messages: [
      {
        id: "m1",
        role: "user",
        content: "Build me a landing page for Cander.",
        at: "12:04",
      },
      {
        id: "m2",
        role: "assistant",
        content:
          "Opened Build on Cander. Preview is on the right — hero, pricing, and footer. Say what to change.",
        at: "12:04",
      },
    ],
  },
  {
    id: "t-campaign",
    title: "Product photo retouch",
    workspaceId: "marketing",
    projectId: "product-campaign",
    spaceId: "studio",
    updatedAt: "4h ago",
    snippet: "Remove background on the stills.",
    messages: [
      {
        id: "m1",
        role: "user",
        content: "Edit this photo and remove the background.",
        at: "10:18",
      },
      {
        id: "m2",
        role: "assistant",
        content:
          "Studio is open on Product Campaign. Background removal is queued on shot 03. Canvas is on the right.",
        at: "10:18",
      },
    ],
  },
  {
    id: "t-pricing",
    title: "OpenAI pricing vs Cander",
    workspaceId: "marketing",
    projectId: "cander",
    spaceId: "research",
    updatedAt: "Yesterday",
    snippet: "Update Cander pricing from the research notes.",
    shared: true,
    messages: [
      {
        id: "m1",
        role: "user",
        content:
          "Research OpenAI pricing and update the pricing section of the Cander website.",
        at: "Yesterday",
      },
      {
        id: "m2",
        role: "assistant",
        content:
          "This belongs to Cander. I pulled competitor pricing into Research, then opened the Cander pricing page in Build. Both stay attached to the same project.",
        at: "Yesterday",
      },
    ],
  },
  {
    id: "t-skill-voice",
    title: "Recursion voice skill",
    workspaceId: "marketing",
    spaceId: "skills",
    updatedAt: "5h ago",
    snippet: "Keep replies Graphite: short, left-aligned, no hype.",
    messages: [
      {
        id: "m1",
        role: "user",
        content: "Write a skill for Recursion tone of voice.",
        at: "09:12",
      },
      {
        id: "m2",
        role: "assistant",
        content:
          "Drafted Recursion voice. Name, when-to-use, and instructions are on the right — edit them, then save.",
        at: "09:12",
      },
    ],
  },
];

export const canderFiles = [
  { path: "app/page.tsx", kind: "file" as const },
  { path: "app/pricing/page.tsx", kind: "file" as const },
  { path: "components/Hero.tsx", kind: "file" as const },
  { path: "components/Pricing.tsx", kind: "file" as const, active: true },
  { path: "lib/plans.ts", kind: "file" as const },
];

export const canderCode = `export function Pricing() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <p className="text-sm text-zinc-500">Plans</p>
      <h2 className="mt-2 text-3xl tracking-tight">
        Simple pricing for Cander.
      </h2>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Plan name="Start" price="$29" />
        <Plan name="Studio" price="$79" featured />
        <Plan name="Scale" price="$240" />
      </div>
    </section>
  );
}`;

export const starbaseFiles = [
  { path: "apps/console/page.tsx", kind: "file" as const, active: true },
  { path: "apps/api/routes.ts", kind: "file" as const },
  { path: "infra/compose.yml", kind: "file" as const },
];

export const researchSources = [
  { title: "OpenAI API Pricing", url: "openai.com/api/pricing", tag: "Saved" },
  { title: "Anthropic plans", url: "anthropic.com/pricing", tag: "Saved" },
  { title: "Courier vs token meters", url: "thinkrecursion.ai", tag: "Internal" },
];

export const platformModels = [
  { name: "Gemma 4-e4b", runtime: "On-device", memory: "7.2 GB", status: "Ready" },
  { name: "Gemma 4 E2B", runtime: "Local", memory: "4.1 GB", status: "Ready" },
  { name: "EXAONE 4.0 32B", runtime: "Cloud", memory: "Hosted", status: "Live" },
];

export const apiKeys = [
  { name: "Production", hint: "crr_live_••••k2a9", created: "Jul 12" },
  { name: "Staging", hint: "crr_test_••••91qx", created: "Aug 2" },
];

export const prompts: { id: string; label: string; space: SpaceId }[] = [
  { id: "p1", label: "Build me a landing page.", space: "build" },
  {
    id: "p2",
    label: "Edit this photo and remove the background.",
    space: "studio",
  },
  { id: "p3", label: "Research these competitors.", space: "research" },
  { id: "p4", label: "Write a skill for Recursion tone of voice.", space: "skills" },
  { id: "p5", label: "Turn this still into an 8-second clip.", space: "studio" },
];

export const spaceStats: Record<
  SpaceId,
  { kicker: string; stats: { label: string; value: string }[] }
> = {
  build: {
    kicker: "Software, sites, and agents",
    stats: [
      { label: "Projects", value: "3" },
      { label: "Previews", value: "11" },
      { label: "Deploys", value: "2" },
      { label: "Open PRs", value: "4" },
    ],
  },
  studio: {
    kicker: "Image and video",
    stats: [
      { label: "Projects", value: "2" },
      { label: "Assets", value: "48" },
      { label: "Exports", value: "6" },
      { label: "In queue", value: "1" },
    ],
  },
  research: {
    kicker: "Sources, notes, reports",
    stats: [
      { label: "Projects", value: "2" },
      { label: "Sources", value: "37" },
      { label: "Reports", value: "5" },
      { label: "Citations", value: "112" },
    ],
  },
  skills: {
    kicker: "Reusable instructions",
    stats: [
      { label: "Skills", value: "3" },
      { label: "AI drafted", value: "1" },
      { label: "Used today", value: "8" },
    ],
  },
  scheduled: {
    kicker: "Anything that runs later",
    stats: [
      { label: "Upcoming", value: "2" },
      { label: "Active", value: "1" },
      { label: "Paused", value: "1" },
      { label: "Failed", value: "0" },
    ],
  },
  connectors: {
    kicker: "Installed and available",
    stats: [
      { label: "Installed", value: "5" },
      { label: "Available", value: "7" },
      { label: "Accounts", value: "8" },
      { label: "Needs reauth", value: "1" },
    ],
  },
};
