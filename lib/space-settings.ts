import type { SpaceId } from "./types";

export type SpaceSettingsItem = {
  id: string;
  name: string;
  detail: string;
  preview?: "theme" | "component" | "template" | "palette";
  themeClass?: "media-a" | "media-b" | "media-c" | "media-d";
  colors?: string[];
  image?: string;
  active?: boolean;
  tags?: string[];
};

export type SpaceSettingsSection = {
  id: string;
  label: string;
  description: string;
  items: SpaceSettingsItem[];
};

export type SpaceSettingsConfig = {
  title: string;
  subtitle: string;
  sections: SpaceSettingsSection[];
};

export const spaceSettings: Record<SpaceId, SpaceSettingsConfig> = {
  work: {
    title: "Work",
    subtitle: "Inbox, calendar, and customers — the day-to-day, not another app.",
    sections: [
      {
        id: "areas",
        label: "Areas",
        description: "What Work can keep in view.",
        items: [
          {
            id: "inbox",
            name: "Inbox",
            detail: "Mail, Slack, and anything waiting on a reply.",
            preview: "theme",
            themeClass: "media-a",
            colors: ["#14B8A6", "#CCFBF1"],
            active: true,
          },
          {
            id: "calendar",
            name: "Calendar",
            detail: "Meetings to prep and follow-ups after.",
            preview: "theme",
            themeClass: "media-c",
            colors: ["#38BDF8", "#E0F2FE"],
            active: true,
          },
          {
            id: "customers",
            name: "Customers",
            detail: "Accounts that need a note, proposal, or nudge.",
            preview: "theme",
            themeClass: "media-b",
            colors: ["#F59E0B", "#0F172A"],
            active: true,
          },
        ],
      },
    ],
  },
  build: {
    title: "Build library",
    subtitle: "Templates, themes, and components — like a built-in 21st.dev kit for new apps.",
    sections: [
      {
        id: "templates",
        label: "Templates",
        description: "Full app shells Courier can scaffold into a live preview.",
        items: [
          {
            id: "saas",
            name: "SaaS landing",
            detail: "Hero, pricing, signup, and footer wired for preview.",
            preview: "template",
            image: "/previews/launch.png",
            tags: ["Marketing"],
          },
          {
            id: "portal",
            name: "Client portal",
            detail: "Auth, files, status updates, and account settings.",
            preview: "template",
            image: "/previews/portal.png",
            tags: ["Product"],
          },
          {
            id: "console",
            name: "Internal console",
            detail: "Tables, filters, detail panels, and bulk actions.",
            preview: "template",
            image: "/previews/console.png",
            tags: ["Ops"],
          },
          {
            id: "docs",
            name: "Docs site",
            detail: "Sidebar nav, search, and versioned content pages.",
            preview: "template",
            image: "/previews/docs.png",
            tags: ["Content"],
          },
        ],
      },
      {
        id: "themes",
        label: "Themes",
        description: "Default look for previews and shipped surfaces.",
        items: [
          {
            id: "graphite",
            name: "Graphite",
            detail: "Courier default — light canvas, dark chrome, blue mesh.",
            preview: "theme",
            themeClass: "media-a",
            colors: ["#6B9FFF", "#1E293B", "#F8FAFC"],
            active: true,
          },
          {
            id: "paper",
            name: "Paper",
            detail: "High-contrast white surfaces with minimal chrome.",
            preview: "theme",
            themeClass: "media-c",
            colors: ["#FFFFFF", "#E2E8F0", "#0F172A"],
          },
          {
            id: "midnight",
            name: "Midnight",
            detail: "Dark-first dashboards and dense product UI.",
            preview: "theme",
            themeClass: "media-b",
            colors: ["#6366F1", "#0B1220", "#94A3B8"],
          },
          {
            id: "aurora",
            name: "Aurora",
            detail: "Violet and cyan gradients for launch pages.",
            preview: "theme",
            themeClass: "media-d",
            colors: ["#22D3EE", "#A78BFA", "#F472B6"],
          },
        ],
      },
      {
        id: "components",
        label: "Components",
        description: "Reusable blocks Courier drops into the next build.",
        items: [
          {
            id: "auth",
            name: "Auth shell",
            detail: "Sign in, magic link, and workspace picker.",
            preview: "component",
            colors: ["#6B9FFF", "#E2E8F0"],
            tags: ["Forms"],
          },
          {
            id: "pricing",
            name: "Pricing table",
            detail: "Tier cards, feature matrix, and CTA row.",
            preview: "component",
            colors: ["#22C55E", "#E2E8F0"],
            tags: ["Marketing"],
          },
          {
            id: "nav",
            name: "App nav",
            detail: "Sidebar, top rail, and mobile drawer.",
            preview: "component",
            colors: ["#6366F1", "#CBD5E1"],
            tags: ["Layout"],
          },
          {
            id: "table",
            name: "Data table",
            detail: "Sortable rows, filters, and empty states.",
            preview: "component",
            colors: ["#F59E0B", "#E2E8F0"],
            tags: ["Data"],
          },
        ],
      },
      {
        id: "stack",
        label: "Stack",
        description: "Runtime Courier uses when scaffolding.",
        items: [
          {
            id: "next",
            name: "Next.js",
            detail: "App router, server actions, preview deploys.",
            preview: "palette",
            colors: ["#000000", "#FFFFFF"],
            active: true,
          },
          {
            id: "vite",
            name: "Vite + React",
            detail: "Fast SPA builds with client routing.",
            preview: "palette",
            colors: ["#646CFF", "#FFC107"],
          },
          {
            id: "static",
            name: "Static export",
            detail: "Marketing sites and lightweight landings.",
            preview: "palette",
            colors: ["#38BDF8", "#F1F5F9"],
          },
        ],
      },
    ],
  },
  studio: {
    title: "Studio library",
    subtitle: "Presets, looks, and pipelines for image and video work.",
    sections: [
      {
        id: "presets",
        label: "Presets",
        description: "Starting points for common Studio jobs.",
        items: [
          {
            id: "still",
            name: "Product still",
            detail: "Clean frame, soft shadow, neutral backdrop.",
            preview: "template",
            image: "/studio/still.png",
            active: true,
          },
          {
            id: "retouch",
            name: "Retouch pass",
            detail: "Color, crop, cleanup, and export sizing.",
            preview: "template",
            image: "/studio/retouch.png",
          },
          {
            id: "bg",
            name: "Background remove",
            detail: "Cutout product shots for web and ads.",
            preview: "template",
            image: "/studio/bg.png",
          },
          {
            id: "video",
            name: "Text to video",
            detail: "8–30s clips from a single prompt.",
            preview: "template",
            image: "/studio/video.png",
          },
        ],
      },
      {
        id: "looks",
        label: "Looks",
        description: "Color grades and grain for consistent output.",
        items: [
          {
            id: "natural",
            name: "Natural light",
            detail: "Warm highlights, soft contrast.",
            preview: "theme",
            themeClass: "media-c",
            colors: ["#FDE68A", "#F97316", "#FFF7ED"],
            active: true,
          },
          {
            id: "studio-cool",
            name: "Studio cool",
            detail: "Crisp whites and blue shadows.",
            preview: "theme",
            themeClass: "media-a",
            colors: ["#BAE6FD", "#38BDF8", "#F8FAFC"],
          },
          {
            id: "cinematic",
            name: "Cinematic",
            detail: "Teal shadows and amber skin tones.",
            preview: "theme",
            themeClass: "media-b",
            colors: ["#14B8A6", "#F59E0B", "#0F172A"],
          },
        ],
      },
      {
        id: "pipelines",
        label: "Pipelines",
        description: "Multi-step flows Courier runs automatically.",
        items: [
          {
            id: "batch-export",
            name: "Batch export",
            detail: "Resize, compress, and deliver all variants.",
            preview: "component",
            colors: ["#A78BFA", "#E9D5FF"],
          },
          {
            id: "brand-kit",
            name: "Brand kit sync",
            detail: "Apply logo, type, and color tokens to assets.",
            preview: "component",
            colors: ["#6366F1", "#C7D2FE"],
          },
        ],
      },
      {
        id: "exports",
        label: "Exports",
        description: "Default formats and delivery targets.",
        items: [
          {
            id: "web",
            name: "Web optimized",
            detail: "AVIF + WebP at 2× for product pages.",
            preview: "palette",
            colors: ["#22C55E", "#DCFCE7"],
            active: true,
          },
          {
            id: "social",
            name: "Social crops",
            detail: "1:1, 4:5, and 9:16 with safe zones.",
            preview: "palette",
            colors: ["#EC4899", "#FCE7F3"],
          },
        ],
      },
    ],
  },
  research: {
    title: "Research library",
    subtitle: "Briefs, layouts, and citation styles for research papers.",
    sections: [
      {
        id: "briefs",
        label: "Briefs",
        description: "Structured starting points for new research.",
        items: [
          {
            id: "competitive",
            name: "Competitive scan",
            detail: "Pricing, positioning, and launch cadence.",
            preview: "component",
            colors: ["#FB923C", "#FFEDD5"],
            active: true,
          },
          {
            id: "market",
            name: "Market sizing",
            detail: "TAM, segments, and growth assumptions.",
            preview: "component",
            colors: ["#38BDF8", "#E0F2FE"],
          },
          {
            id: "voc",
            name: "Voice of customer",
            detail: "Themes from support, sales, and reviews.",
            preview: "component",
            colors: ["#A78BFA", "#EDE9FE"],
          },
        ],
      },
      {
        id: "layouts",
        label: "Paper layouts",
        description: "How sources and notes appear on the page.",
        items: [
          {
            id: "memo",
            name: "Executive memo",
            detail: "Short summary up top, evidence below.",
            preview: "theme",
            themeClass: "media-c",
            colors: ["#FFFFFF", "#0F172A", "#E2E8F0"],
            active: true,
          },
          {
            id: "dossier",
            name: "Source dossier",
            detail: "Long-form with inline citations.",
            preview: "theme",
            themeClass: "media-a",
            colors: ["#FFF7ED", "#EA580C", "#FED7AA"],
          },
        ],
      },
      {
        id: "sources",
        label: "Source types",
        description: "What Courier pulls in by default.",
        items: [
          {
            id: "web",
            name: "Web pages",
            detail: "Articles, docs, changelogs, and blogs.",
            preview: "palette",
            colors: ["#3B82F6", "#DBEAFE"],
          },
          {
            id: "pdf",
            name: "PDFs & decks",
            detail: "Reports, investor updates, and slide exports.",
            preview: "palette",
            colors: ["#EF4444", "#FEE2E2"],
          },
        ],
      },
      {
        id: "citations",
        label: "Citations",
        description: "Formatting for references and footnotes.",
        items: [
          {
            id: "inline",
            name: "Inline links",
            detail: "Linked excerpts with hover previews.",
            preview: "component",
            colors: ["#0EA5E9", "#E0F2FE"],
            active: true,
          },
          {
            id: "footnotes",
            name: "Footnotes",
            detail: "Numbered references at the bottom.",
            preview: "component",
            colors: ["#64748B", "#F1F5F9"],
          },
        ],
      },
    ],
  },
  files: {
    title: "Files library",
    subtitle: "Views, tags, and import rules for the workspace library.",
    sections: [
      {
        id: "views",
        label: "Views",
        description: "How files are grouped and browsed.",
        items: [
          {
            id: "grid",
            name: "Grid",
            detail: "Thumbnails with type badges.",
            preview: "component",
            colors: ["#6366F1", "#E0E7FF"],
            active: true,
          },
          {
            id: "list",
            name: "List",
            detail: "Dense rows with sort and filter.",
            preview: "component",
            colors: ["#14B8A6", "#CCFBF1"],
          },
        ],
      },
      {
        id: "tags",
        label: "Tags",
        description: "Default labels applied to new assets.",
        items: [
          {
            id: "space",
            name: "By space",
            detail: "Build, Studio, Research, and Tasks.",
            preview: "palette",
            colors: ["#6B9FFF", "#A78BFA", "#FB923C"],
          },
          {
            id: "project",
            name: "By project",
            detail: "Mirror project names from chat work.",
            preview: "palette",
            colors: ["#22C55E", "#BBF7D0"],
          },
        ],
      },
      {
        id: "imports",
        label: "Imports",
        description: "Where new files can come from.",
        items: [
          {
            id: "upload",
            name: "Direct upload",
            detail: "Drag and drop into the library.",
            preview: "component",
            colors: ["#3B82F6", "#DBEAFE"],
            active: true,
          },
          {
            id: "connectors",
            name: "From connectors",
            detail: "Drive, Dropbox, and Figma exports.",
            preview: "component",
            colors: ["#F59E0B", "#FEF3C7"],
          },
        ],
      },
    ],
  },
  skills: {
    title: "Tasks library",
    subtitle: "Playbooks, triggers, and examples for reusable instructions.",
    sections: [
      {
        id: "playbooks",
        label: "Playbooks",
        description: "Ready-made task templates.",
        items: [
          {
            id: "tone",
            name: "Brand tone",
            detail: "Recursion voice for outbound copy.",
            preview: "component",
            colors: ["#6366F1", "#E0E7FF"],
            active: true,
          },
          {
            id: "weekly",
            name: "Weekly recap",
            detail: "Summarize what shipped across spaces.",
            preview: "component",
            colors: ["#22C55E", "#DCFCE7"],
          },
        ],
      },
      {
        id: "triggers",
        label: "Triggers",
        description: "When Courier should run a task.",
        items: [
          {
            id: "manual",
            name: "Manual",
            detail: "Run from chat or the Tasks panel.",
            preview: "palette",
            colors: ["#64748B", "#F1F5F9"],
            active: true,
          },
          {
            id: "scheduled",
            name: "On schedule",
            detail: "Daily, weekly, or custom cadence.",
            preview: "palette",
            colors: ["#F59E0B", "#FEF3C7"],
          },
        ],
      },
      {
        id: "examples",
        label: "Examples",
        description: "Sample inputs that teach the task shape.",
        items: [
          {
            id: "brief",
            name: "One-line brief",
            detail: "Short instruction with expected output.",
            preview: "theme",
            themeClass: "media-a",
            colors: ["#6B9FFF", "#F8FAFC"],
          },
        ],
      },
    ],
  },
  scheduled: {
    title: "Scheduled library",
    subtitle: "Cadences, triggers, and alert templates for recurring work.",
    sections: [
      {
        id: "cadences",
        label: "Cadences",
        description: "Common schedules for automated jobs.",
        items: [
          {
            id: "daily",
            name: "Daily digest",
            detail: "Morning summary of what changed.",
            preview: "palette",
            colors: ["#38BDF8", "#E0F2FE"],
            active: true,
          },
          {
            id: "weekly",
            name: "Weekly ship note",
            detail: "Friday recap of previews and deploys.",
            preview: "palette",
            colors: ["#A78BFA", "#EDE9FE"],
          },
        ],
      },
      {
        id: "triggers",
        label: "Triggers",
        description: "Events that can start a scheduled job.",
        items: [
          {
            id: "cron",
            name: "Time-based",
            detail: "Cron-style schedules with timezone.",
            preview: "component",
            colors: ["#6366F1", "#C7D2FE"],
          },
          {
            id: "webhook",
            name: "Webhook",
            detail: "External systems ping Courier to run.",
            preview: "component",
            colors: ["#14B8A6", "#99F6E4"],
          },
        ],
      },
      {
        id: "alerts",
        label: "Alerts",
        description: "What happens when a job fails or stalls.",
        items: [
          {
            id: "email",
            name: "Email owner",
            detail: "Notify the job owner on failure.",
            preview: "component",
            colors: ["#EF4444", "#FEE2E2"],
            active: true,
          },
        ],
      },
    ],
  },
  connectors: {
    title: "Connectors library",
    subtitle: "Bundles, auth flows, and scopes for third-party tools.",
    sections: [
      {
        id: "bundles",
        label: "Bundles",
        description: "Pre-wired connector groups for common stacks.",
        items: [
          {
            id: "gtm",
            name: "Go-to-market",
            detail: "HubSpot, Slack, and Notion together.",
            preview: "palette",
            colors: ["#FF7A59", "#4A154B", "#000000"],
            active: true,
          },
          {
            id: "eng",
            name: "Engineering",
            detail: "GitHub, Linear, and Datadog.",
            preview: "palette",
            colors: ["#181717", "#5E6AD2", "#632CA6"],
          },
        ],
      },
      {
        id: "auth",
        label: "Auth",
        description: "Default connection patterns.",
        items: [
          {
            id: "oauth",
            name: "OAuth",
            detail: "Standard user-consent flows.",
            preview: "component",
            colors: ["#3B82F6", "#DBEAFE"],
            active: true,
          },
          {
            id: "api-key",
            name: "API key",
            detail: "Workspace-scoped secrets.",
            preview: "component",
            colors: ["#64748B", "#F1F5F9"],
          },
        ],
      },
      {
        id: "scopes",
        label: "Scopes",
        description: "Permission templates for installs.",
        items: [
          {
            id: "read",
            name: "Read-only",
            detail: "Browse and search connected data.",
            preview: "theme",
            themeClass: "media-c",
            colors: ["#22C55E", "#DCFCE7"],
          },
          {
            id: "write",
            name: "Read + write",
            detail: "Create and update on behalf of users.",
            preview: "theme",
            themeClass: "media-a",
            colors: ["#F59E0B", "#FEF3C7"],
          },
        ],
      },
    ],
  },
  finances: {
    title: "Finances library",
    subtitle: "Reports, categories, and rules for books and spend.",
    sections: [
      {
        id: "reports",
        label: "Reports",
        description: "Default financial views.",
        items: [
          {
            id: "runway",
            name: "Runway",
            detail: "Cash, burn, and months remaining.",
            preview: "component",
            colors: ["#22C55E", "#DCFCE7"],
            active: true,
          },
          {
            id: "ap",
            name: "Accounts payable",
            detail: "Open invoices and due dates.",
            preview: "component",
            colors: ["#EF4444", "#FEE2E2"],
          },
        ],
      },
      {
        id: "categories",
        label: "Categories",
        description: "How spend is classified.",
        items: [
          {
            id: "saas",
            name: "SaaS & tools",
            detail: "Software subscriptions and seats.",
            preview: "palette",
            colors: ["#6366F1", "#E0E7FF"],
          },
          {
            id: "people",
            name: "People",
            detail: "Payroll, contractors, and benefits.",
            preview: "palette",
            colors: ["#F59E0B", "#FEF3C7"],
          },
        ],
      },
      {
        id: "rules",
        label: "Rules",
        description: "Automation for review and alerts.",
        items: [
          {
            id: "threshold",
            name: "Spend threshold",
            detail: "Flag invoices over a set amount.",
            preview: "theme",
            themeClass: "media-b",
            colors: ["#F59E0B", "#0F172A"],
            active: true,
          },
        ],
      },
    ],
  },
  health: {
    title: "Health library",
    subtitle: "Trackers, care plans, and forms for health workflows.",
    sections: [
      {
        id: "trackers",
        label: "Trackers",
        description: "What to monitor over time.",
        items: [
          {
            id: "labs",
            name: "Lab results",
            detail: "Trend lines for key markers.",
            preview: "component",
            colors: ["#EF4444", "#FEE2E2"],
            active: true,
          },
          {
            id: "meds",
            name: "Medications",
            detail: "Schedule, dosage, and refill dates.",
            preview: "component",
            colors: ["#3B82F6", "#DBEAFE"],
          },
        ],
      },
      {
        id: "plans",
        label: "Care plans",
        description: "Structured follow-up templates.",
        items: [
          {
            id: "quarterly",
            name: "Quarterly check-in",
            detail: "Goals, labs, and next appointments.",
            preview: "theme",
            themeClass: "media-c",
            colors: ["#14B8A6", "#CCFBF1"],
            active: true,
          },
        ],
      },
      {
        id: "forms",
        label: "Forms",
        description: "Intake and update questionnaires.",
        items: [
          {
            id: "intake",
            name: "New patient intake",
            detail: "History, meds, and insurance.",
            preview: "palette",
            colors: ["#A78BFA", "#EDE9FE"],
          },
        ],
      },
    ],
  },
  personal: {
    title: "Personal",
    subtitle: "Today, money, health, goals, and the car — separate from product work.",
    sections: [
      {
        id: "areas",
        label: "Areas",
        description: "What Personal can track. Add more as life needs them.",
        items: [
          {
            id: "today",
            name: "Today",
            detail: "Plans, reservations, and whatever is due.",
            preview: "theme",
            themeClass: "media-a",
            colors: ["#6B9FFF", "#F8FAFC"],
            active: true,
          },
          {
            id: "money",
            name: "Money",
            detail: "Bills, subscriptions, spend, and books.",
            preview: "theme",
            themeClass: "media-b",
            colors: ["#F59E0B", "#0F172A"],
            active: true,
          },
          {
            id: "health",
            name: "Health",
            detail: "Care plans, benefits, and trackers.",
            preview: "theme",
            themeClass: "media-c",
            colors: ["#14B8A6", "#CCFBF1"],
            active: true,
          },
          {
            id: "goals",
            name: "Goals",
            detail: "What you’re finishing this year, and what’s slipping.",
            preview: "theme",
            themeClass: "media-d",
            colors: ["#818CF8", "#EEF2FF"],
            active: true,
          },
          {
            id: "car",
            name: "Car",
            detail: "Registration, insurance, and service.",
            preview: "theme",
            themeClass: "media-b",
            colors: ["#38BDF8", "#0F172A"],
            active: true,
          },
        ],
      },
    ],
  },
};
